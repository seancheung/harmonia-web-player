import {
  api,
  defaults,
  load,
  mediaURL,
  type Preferences,
  replayGain,
  save,
  type Track,
} from "./model";

export interface Playback {
  queue: Track[];
  gainContext: "track" | "album";
  index: number;
  position: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "single";
  playing: boolean;
  loading: boolean;
  error: string;
  remote: boolean;
  deadline: number;
  finish: boolean;
  waiting: boolean;
}
const initial: Playback = {
  queue: [],
  gainContext: "track",
  index: 0,
  position: 0,
  volume: 0.75,
  shuffle: false,
  repeat: "off",
  playing: false,
  loading: false,
  error: "",
  remote: false,
  deadline: 0,
  finish: false,
  waiting: false,
};
// AudioBufferSource nodes schedule adjacent tracks on the same audio clock.
// Only the current and next decoded buffers are held in memory.
export class Player {
  state: Playback = {
    ...initial,
    ...load<Partial<Playback>>("playback", {}),
    queue: load<Track[]>(
      "playback.queue",
      load<Partial<Playback>>("playback", {}).queue || [],
    ),
    playing: false,
    loading: false,
  };
  private listeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private nextSource: AudioBufferSourceNode | null = null;
  private nextGain: GainNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private nextBuffer: AudioBuffer | null = null;
  private nextIndex = -1;
  private audio: HTMLAudioElement | null = null;
  private audioNode: MediaElementAudioSourceNode | null = null;
  private start = 0;
  private offset = 0;
  private generation = 0;
  private controller: AbortController | null = null;
  private preloadController: AbortController | null = null;
  private failed = new Set<string>();
  private session = "";
  private listened = 0;
  private seeked = false;
  private counted = false;
  private lastTick = performance.now();
  private lastSave = 0;
  private remoteTick = 0;
  private audioPreferences = "";
  private savedQueue: Track[] | null = null;
  private remoteVersion = "";
  private remoteSync: Promise<void> | null = null;
  constructor() {
    if (typeof window === "undefined") return;
    setInterval(() => this.tick(), 200);
    window.addEventListener("pagehide", () => this.persist());
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  snapshot = () => this.state;
  private emit(patch: Partial<Playback> = {}) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
  private prefs(): Preferences {
    return load("preferences", defaults);
  }
  private persist() {
    const { queue, ...progress } = this.state;
    try {
      if (queue !== this.savedQueue) {
        // Lyrics are fetched separately; the library restores complete tags.
        save(
          "playback.queue",
          queue.map((track) => ({ ...track, lyrics: "", tags: {} })),
        );
        this.savedQueue = queue;
      }
      save("playback", {
        ...progress,
        playing: false,
        loading: false,
        error: "",
      });
    } catch {
      // Storage quota or privacy settings must not interrupt playback.
    }
  }
  private async setup() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }
    await this.context.resume();
    this.applyGain();
  }
  applyGain() {
    const preferences = this.prefs();
    const signature = JSON.stringify([
      preferences.gain,
      preferences.preamp,
      preferences.protect,
      preferences.ruleSet,
    ]);
    const changed =
      !!this.audioPreferences && this.audioPreferences !== signature;
    this.audioPreferences = signature;
    if (this.state.remote && changed) {
      void this.startRemote();
      return;
    }
    const t = this.state.queue[this.state.index];
    const factor = t
      ? replayGain(t, this.prefs(), this.state.gainContext).factor
      : 1;
    if (this.gain) this.gain.gain.value = factor * this.state.volume;
    if (this.audio) this.audio.volume = 1;
    this.cancelNext();
    if (this.state.playing && this.currentBuffer) void this.preload();
  }
  private dispose() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.cancelNext();
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {}
      this.source.disconnect();
      this.source = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audioNode?.disconnect();
      this.audioNode = null;
      this.audio = null;
    }
    this.currentBuffer = null;
  }
  private cancelNext() {
    this.preloadController?.abort();
    this.preloadController = null;
    if (this.nextSource) {
      this.nextSource.onended = null;
      try {
        this.nextSource.stop();
      } catch {}
      this.nextSource.disconnect();
      this.nextSource = null;
    }
    this.nextGain?.disconnect();
    this.nextGain = null;
    this.nextBuffer = null;
    this.nextIndex = -1;
  }
  replace(
    tracks: Track[],
    index = 0,
    gainContext: "track" | "album" = "track",
  ) {
    this.failed.clear();
    const selected = tracks[index]?.id;
    const queue = tracks.filter((t) => !t.missing);
    if (!queue.length) {
      this.emit({ error: "emptyPlaylist" });
      return;
    }
    this.cancelEndTimer();
    this.emit({
      queue,
      gainContext,
      index: Math.max(
        0,
        queue.findIndex((t) => t.id === selected),
      ),
      position: 0,
    });
    this.persist();
    if (this.state.remote) void this.startRemote();
    else void this.play(true);
  }
  reconcile(tracks: Track[]) {
    const byID = new Map(tracks.map((t) => [t.id, t]));
    this.emit({
      queue: this.state.queue.map(
        (t) => byID.get(t.id) ?? { ...t, missing: true },
      ),
    });
    if (this.state.queue[this.state.index]?.missing)
      this.emit({ error: "missing" });
  }
  async play(newSession = false) {
    if (this.state.remote) {
      await this.remote({ action: "play" });
      return;
    }
    const t = this.state.queue[this.state.index];
    if (!t) return;
    if (t.duration > 0 && this.state.position >= t.duration - 0.01) {
      this.emit({ position: 0 });
      newSession = true;
    }
    const position = this.state.position;
    this.dispose();
    const generation = this.generation;
    this.emit({ loading: true, error: "" });
    if (newSession || !this.session) {
      this.session = sessionID();
      this.listened = 0;
      this.seeked = false;
      this.counted = false;
    }
    try {
      if (t.missing) throw new Error("missing");
      await this.setup();
      if (generation !== this.generation) return;
      this.controller = new AbortController();
      if (t.size > 100 * 1024 * 1024) {
        await this.stream(t, position, generation);
        return;
      }
      const res = await fetch(mediaURL(t), { signal: this.controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "unsupported" }));
        throw new Error(body.error);
      }
      const bytes = await res.arrayBuffer();
      const context = this.context;
      const gain = this.gain;
      if (!context || !gain) return;
      const buffer = await context.decodeAudioData(bytes);
      if (generation !== this.generation) return;
      this.currentBuffer = buffer;
      this.offset = Math.min(position, Math.max(0, buffer.duration - 0.001));
      this.start = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = () => this.ended();
      this.source = source;
      source.start(0, this.offset);
      this.lastTick = performance.now();
      this.emit({ playing: true, loading: false });
      void this.preload();
    } catch (e) {
      if (
        generation !== this.generation ||
        (e instanceof DOMException && e.name === "AbortError")
      )
        return;
      this.fail(e);
    }
  }
  private async stream(t: Track, position: number, generation: number) {
    if (!this.context || !this.gain) return;
    const audio = new Audio();
    this.audio = audio;
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = mediaURL(t);
    this.audioNode = this.context.createMediaElementSource(audio);
    this.audioNode.connect(this.gain);
    audio.onloadedmetadata = () => {
      audio.currentTime = position;
    };
    audio.onended = () => this.ended();
    audio.onerror = () => {
      if (generation === this.generation) this.fail(new Error("unsupported"));
    };
    await audio.play();
    if (generation !== this.generation) return;
    this.lastTick = performance.now();
    this.emit({ playing: true, loading: false });
  }
  private candidate(manual = false): number {
    const { queue, index, repeat, shuffle } = this.state;
    if (!queue.length) return -1;
    if (!manual && repeat === "single" && !this.failed.has(queue[index].id))
      return index;
    const valid = queue
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t, i }) =>
          !t.missing &&
          !this.failed.has(t.id) &&
          (i !== index || queue.length === 1),
      );
    if (shuffle)
      return valid.length
        ? valid[Math.floor(Math.random() * valid.length)].i
        : -1;
    for (let i = index + 1; i < queue.length; i++)
      if (!queue[i].missing && !this.failed.has(queue[i].id)) return i;
    if (repeat === "all")
      for (let i = 0; i <= index; i++)
        if (!queue[i].missing && !this.failed.has(queue[i].id)) return i;
    return -1;
  }
  private async preload() {
    this.cancelNext();
    const next = this.candidate();
    if (
      next < 0 ||
      this.state.waiting ||
      !this.currentBuffer ||
      !this.context ||
      !this.state.playing
    )
      return;
    const t = this.state.queue[next];
    if (t.size > 100 * 1024 * 1024) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.preloadController = controller;
    try {
      let buffer: AudioBuffer;
      if (t.id === this.state.queue[this.state.index]?.id)
        buffer = this.currentBuffer;
      else {
        const res = await fetch(mediaURL(t), { signal: controller.signal });
        if (!res.ok) return;
        buffer = await this.context.decodeAudioData(await res.arrayBuffer());
      }
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        !this.state.playing ||
        !this.currentBuffer
      )
        return;
      this.nextBuffer = buffer;
      this.nextIndex = next;
      const when = this.start + this.currentBuffer.duration - this.offset;
      if (when <= this.context.currentTime) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const gain = this.context.createGain();
      gain.gain.value =
        replayGain(t, this.prefs(), this.state.gainContext).factor *
        this.state.volume;
      gain.connect(this.context.destination);
      source.connect(gain);
      this.nextGain = gain;
      this.nextSource = source;
      source.start(when);
    } catch {
      /* A failed prefetch is handled by normal playback, without changing format. */
    }
  }
  private ended() {
    this.report(true);
    if (this.state.waiting) {
      this.pause();
      this.emit({
        deadline: 0,
        waiting: false,
        position:
          this.state.queue[this.state.index]?.duration || this.state.position,
      });
      return;
    }
    const scheduled = this.nextSource;
    const next = scheduled ? this.nextIndex : this.candidate();
    if (next < 0) {
      this.emit({
        position:
          this.state.queue[this.state.index]?.duration || this.state.position,
      });
      this.pause();
      return;
    }
    if (scheduled && this.nextBuffer && this.context && this.currentBuffer) {
      const when = this.start + this.currentBuffer.duration - this.offset;
      this.source?.disconnect();
      this.gain?.disconnect();
      this.gain = this.nextGain;
      this.nextGain = null;
      this.source = scheduled;
      this.source.onended = () => this.ended();
      this.currentBuffer = this.nextBuffer;
      this.nextBuffer = null;
      this.nextSource = null;
      this.nextIndex = -1;
      this.start = when;
      this.offset = 0;
      this.session = sessionID();
      this.listened = 0;
      this.counted = false;
      this.seeked = false;
      this.lastTick = performance.now();
      this.emit({ index: next, position: 0 });
      void this.preload();
    } else {
      this.emit({ index: next, position: 0 });
      void this.play(true);
    }
  }
  private fail(error: unknown) {
    const id = this.state.queue[this.state.index]?.id;
    if (id) this.failed.add(id);
    const message = error instanceof Error ? error.message : "unsupported";
    this.emit({ error: message, loading: false, playing: false });
    if (this.prefs().failure === "skip") {
      const next = this.candidate(true);
      if (next >= 0) {
        this.emit({ index: next, position: 0 });
        void this.play(true);
        return;
      }
    }
    this.dispose();
    this.persist();
  }
  pause() {
    if (this.state.remote) {
      void this.remote({ action: "pause" });
      return;
    }
    this.report(false);
    this.dispose();
    this.emit({ playing: false, loading: false });
    this.persist();
  }
  toggle() {
    if (this.state.playing) this.pause();
    else void this.play();
  }
  select(index: number) {
    if (index < 0 || index >= this.state.queue.length) return;
    this.cancelEndTimer();
    this.emit({ index, position: 0 });
    if (this.state.remote)
      void this.remote({ action: "select", index }).catch(() => {});
    else void this.play(true);
  }
  next() {
    const next = this.candidate(true);
    if (next >= 0) this.select(next);
    else this.pause();
  }
  previous() {
    if (this.state.position > 3) this.seek(0);
    else this.select(Math.max(0, this.state.index - 1));
  }
  seek(position: number) {
    if (!Number.isFinite(position)) return;
    const track = this.state.queue[this.state.index];
    if (!track) return;
    position = Math.max(0, Math.min(position, track.duration || position));
    this.seeked = true;
    if (this.state.remote) {
      void this.remote({
        action: "seek",
        position: Math.round(position * 1000),
      });
      return;
    }
    const playing = this.state.playing || this.state.loading;
    if (this.audio && !this.state.loading && this.audio.readyState >= 1) {
      this.audio.currentTime = position;
      this.lastTick = performance.now();
      this.emit({ position });
      this.persist();
      return;
    }
    if (playing && this.currentBuffer && this.context && this.gain) {
      this.generation++;
      this.cancelNext();
      if (this.source) {
        this.source.onended = null;
        this.source.stop();
        this.source.disconnect();
      }
      this.offset = Math.min(
        position,
        Math.max(0, this.currentBuffer.duration - 0.001),
      );
      this.start = this.context.currentTime;
      const source = this.context.createBufferSource();
      source.buffer = this.currentBuffer;
      source.connect(this.gain);
      source.onended = () => this.ended();
      this.source = source;
      source.start(0, this.offset);
      this.lastTick = performance.now();
      this.emit({ position: this.offset, loading: false });
      void this.preload();
      this.persist();
      return;
    }
    this.emit({ position });
    if (playing) void this.play();
    else this.persist();
  }
  volume(volume: number) {
    this.emit({ volume });
    if (this.state.remote)
      void this.remote({ action: "volume", volume: Math.round(volume * 100) });
    else this.applyGain();
    this.persist();
  }
  repeat() {
    const repeat = ({ off: "all", all: "single", single: "off" } as const)[
      this.state.repeat
    ];
    this.emit({ repeat });
    if (this.state.remote) void this.remote({ action: "repeat", repeat });
    else void this.preload();
    this.persist();
  }
  shuffle() {
    this.emit({ shuffle: !this.state.shuffle });
    if (this.state.remote)
      void this.remote({ action: "shuffle", shuffle: this.state.shuffle });
    else void this.preload();
    this.persist();
  }
  add(tracks: Track[], next = false) {
    if (this.state.remote) {
      void this.remote({
        action: "append",
        ids: tracks.filter((t) => !t.missing).map((t) => t.id),
        position: next ? this.state.index + 1 : this.state.queue.length,
      }).catch(() => {});
      return;
    }
    const queue = [...this.state.queue];
    queue.splice(
      next ? this.state.index + 1 : queue.length,
      0,
      ...tracks.filter((t) => !t.missing),
    );
    this.emit({ queue });
    void this.preload();
    this.persist();
  }
  move(from: number, to: number) {
    if (this.state.remote) {
      void this.remote({ action: "move", index: from, position: to }).catch(
        () => {},
      );
      return;
    }
    const queue = [...this.state.queue];
    if (to < 0 || to >= queue.length) return;
    const current = queue[this.state.index];
    const [item] = queue.splice(from, 1);
    queue.splice(to, 0, item);
    this.emit({ queue, index: queue.indexOf(current) });
    void this.preload();
    this.persist();
  }
  remove(index: number) {
    if (this.state.remote) {
      void this.remote({ action: "remove", index }).catch(() => {});
      return;
    }
    if (index === this.state.index) {
      this.pause();
      const queue = this.state.queue.filter((_, i) => i !== index);
      this.emit({
        queue,
        index: Math.min(index, Math.max(0, queue.length - 1)),
        position: 0,
      });
    } else
      this.emit({
        queue: this.state.queue.filter((_, i) => i !== index),
        index: this.state.index - (index < this.state.index ? 1 : 0),
      });
    void this.preload();
    this.persist();
  }
  clear() {
    if (this.state.remote) {
      void this.remote({ action: "clear" }).catch(() => {});
      return;
    }
    this.pause();
    this.emit({ queue: [], index: 0, position: 0 });
    this.persist();
  }
  timer(minutes: number, finish: boolean, end = false) {
    this.emit({
      deadline: end ? 0 : minutes > 0 ? Date.now() + minutes * 60000 : 0,
      finish,
      waiting: end,
    });
    this.cancelNext();
    if (this.state.remote)
      void this.remote({
        action: "timer",
        deadline: this.state.deadline,
        finish: end || finish,
      });
    else if (!end) void this.preload();
    this.persist();
  }
  private cancelEndTimer() {
    if (this.state.waiting) {
      this.emit({ waiting: false, deadline: 0, error: "timerCancelled" });
      if (this.state.remote)
        void this.remote({ action: "timer", deadline: 0, finish: false });
    }
  }
  private tick() {
    if (this.state.deadline && !this.state.playing && !this.state.remote)
      this.emit();
    const now = performance.now();
    const elapsed = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (this.state.remote) {
      if (now - this.remoteTick > 1500) {
        this.remoteTick = now;
        void this.syncRemote();
      }
      return;
    }
    if (this.state.playing && !this.state.loading && !this.audio?.seeking) {
      const position =
        this.audio?.currentTime ??
        (this.context
          ? this.context.currentTime - this.start + this.offset
          : this.state.position);
      if (
        elapsed < 2 &&
        (!this.audio ||
          (!this.audio.paused &&
            !this.audio.seeking &&
            this.audio.readyState >= 3))
      )
        this.listened += Math.min(
          elapsed,
          Math.max(0, position - this.state.position) + 0.02,
        );
      this.emit({ position });
      this.report(false);
    }
    if (this.state.deadline && Date.now() >= this.state.deadline) {
      if (this.state.finish && this.state.playing) {
        this.emit({ deadline: 0, waiting: true });
        this.cancelNext();
      } else {
        this.pause();
        this.emit({ deadline: 0, waiting: false });
      }
    }
    if (now - this.lastSave > 2000) {
      this.persist();
      this.lastSave = now;
    }
  }
  private report(completed: boolean) {
    const t = this.state.queue[this.state.index];
    if (!t || this.counted || !this.session) return;
    if (
      this.listened >= 15 ||
      (t.duration > 0 && t.duration < 15 && completed && !this.seeked)
    ) {
      this.counted = true;
      void api(`/tracks/${t.id}/played`, "POST", {
        session: this.session,
        seconds: this.listened,
        completed,
        seeked: this.seeked,
      })
        .then(() => window.dispatchEvent(new Event("harmonia:library")))
        .catch(() => {
          this.counted = false;
        });
    }
  }
  async remote(body: unknown) {
    try {
      await api("/remote", "POST", body);
      await this.syncRemote(true);
    } catch (e) {
      this.remoteVersion = "";
      await this.syncRemote(true);
      this.emit({ error: e instanceof Error ? e.message : "error" });
      throw e;
    }
  }
  async startRemote(outputs?: string[]) {
    const transfer = { ...this.state };
    this.dispose();
    this.emit({ playing: false, loading: true });
    try {
      if (outputs) await this.remote({ action: "outputs", outputs });
      const p = this.prefs();
      await this.remote({
        action: "start",
        ids: transfer.queue.map((t) => t.id),
        index: transfer.index,
        ruleSet: p.ruleSet,
        gain: p.gain === "auto" ? transfer.gainContext : p.gain,
        gainContext: transfer.gainContext,
        preamp: p.preamp,
        protect: p.protect,
      });
      this.emit({ remote: true, loading: false });
      await this.remote({
        action: "seek",
        position: Math.round(transfer.position * 1000),
      });
      await this.remote({ action: "repeat", repeat: transfer.repeat });
      await this.remote({ action: "shuffle", shuffle: transfer.shuffle });
      await this.remote({
        action: "volume",
        volume: Math.round(transfer.volume * 100),
      });
      await this.remote({
        action: "timer",
        deadline: transfer.deadline,
        finish: transfer.waiting || transfer.finish,
      });
      this.persist();
    } catch {
      this.emit({ loading: false, playing: false });
    }
  }
  async local() {
    const transfer = { ...this.state };
    try {
      await this.remote({ action: "local" });
      this.emit({
        remote: false,
        playing: false,
        deadline: transfer.deadline,
        waiting: transfer.waiting,
        finish: transfer.finish,
      });
      this.persist();
    } catch {
      /* Keep the remote output selected when stopping it fails. */
    }
  }
  async syncRemote(force = false): Promise<void> {
    if (this.remoteSync) {
      await this.remoteSync;
      if (!force) return;
    }
    const pending = this.readRemote();
    this.remoteSync = pending;
    try {
      await pending;
    } finally {
      if (this.remoteSync === pending) this.remoteSync = null;
    }
  }
  private async readRemote() {
    try {
      const s = await api<{
        configured: boolean;
        player: {
          state?: string;
          item_progress_ms?: number;
          repeat?: "off" | "all" | "single";
          shuffle?: boolean;
          volume?: number;
        };
        queue?: Track[];
        queueVersion?: string;
        gainContext?: "track" | "album";
        index: number;
        deadline: number;
        waiting: boolean;
        finish: boolean;
        error: string;
      }>(`/remote?queueVersion=${encodeURIComponent(this.remoteVersion)}`);
      if (!this.state.remote && s.player.state !== "play") return;
      if (!s.configured) {
        if (this.state.remote)
          this.emit({
            remote: false,
            playing: false,
            error: "airplayUnavailable",
          });
        return;
      }
      if (s.player.state === "play" && !this.state.remote && s.queue?.length) {
        this.dispose();
        this.emit({ remote: true });
      }
      this.emit({
        ...(s.queue ? { queue: s.queue } : {}),
        index: s.index,
        gainContext: s.gainContext === "album" ? "album" : "track",
        repeat: s.player.repeat ?? this.state.repeat,
        shuffle: s.player.shuffle ?? this.state.shuffle,
        volume:
          s.player.volume !== undefined
            ? s.player.volume / 100
            : this.state.volume,
        playing: s.player.state === "play",
        position: (s.player.item_progress_ms ?? 0) / 1000,
        deadline: s.deadline,
        waiting: s.waiting,
        finish: s.finish,
        error: s.error || this.state.error,
      });
      if (s.queueVersion) this.remoteVersion = s.queueVersion;
    } catch (e) {
      if (this.state.remote)
        this.emit({ error: e instanceof Error ? e.message : "error" });
    }
  }
}
export const player = new Player();

function sessionID() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
