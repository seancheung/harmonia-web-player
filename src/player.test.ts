import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaults, load, save, type Track } from "./model";
import { Player } from "./player";

const starts: number[] = [];
class AudioClock {
  get currentTime() {
    return Date.now() / 1000;
  }
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createMediaElementSource() {
    return { connect() {}, disconnect() {} };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 2 });
  }
  createBufferSource() {
    const clock = this;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
      buffer: null as { duration: number } | null,
      onended: null as (() => void) | null,
      connect() {},
      disconnect() {},
      start(when = 0, offset = 0) {
        const time = when || clock.currentTime;
        starts.push(time);
        timer = setTimeout(
          () => this.onended?.(),
          (time - clock.currentTime + (this.buffer?.duration || 0) - offset) *
            1000,
        );
      },
      stop() {
        clearTimeout(timer);
      },
    };
  }
}
const track = (id: string): Track =>
  ({
    id,
    title: id,
    duration: 2,
    size: 100,
    revision: "r",
    missing: false,
    trackGain: null,
    albumGain: null,
    trackPeak: null,
    albumPeak: null,
  }) as Track;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  starts.length = 0;
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("window", {
    location: new URL("http://192.168.3.50:5173/home"),
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  vi.stubGlobal("AudioContext", AudioClock);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      json: async () => ({ ok: true }),
    })),
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("player behavior", () => {
  it("selects remote outputs before a song and sends later playback to them", async () => {
    const p = new Player();
    const remote = vi.spyOn(p, "remote").mockResolvedValue(undefined);
    await p.startRemote(["speaker"]);
    expect(remote.mock.calls).toEqual([
      [{ action: "outputs", outputs: ["speaker"] }],
    ]);
    expect(p.state.remote).toBe(true);
    expect(p.state.loading).toBe(false);
    expect(p.state.playing).toBe(false);
    expect(new Player().state.remote).toBe(true);
    p.replace([track("one")]);
    await flush();
    expect(remote).toHaveBeenCalledWith(
      expect.objectContaining({ action: "start", ids: ["one"] }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps local output when selecting a speaker fails with an empty queue", async () => {
    const p = new Player();
    vi.spyOn(p, "remote").mockRejectedValue(new Error("unavailable"));
    await p.startRemote(["speaker"]);
    expect(p.state.remote).toBe(false);
    expect(p.state.loading).toBe(false);
  });
  it("reuses iOS media playback across pause and track changes with gain enabled", async () => {
    const audioSession = { type: "auto" };
    vi.stubGlobal("navigator", { userAgent: "iPhone", audioSession });
    const elements: MobileAudio[] = [];
    class MobileAudio {
      private source = "";
      private needsLoad = false;
      get src() {
        return this.source;
      }
      set src(value: string) {
        this.source = value;
        this.needsLoad = true;
      }
      crossOrigin: string | null = "";
      preload = "";
      volume = 1;
      readyState = 4;
      currentTime = 0;
      paused = true;
      ended = false;
      seeking = false;
      constructor() {
        elements.push(this);
      }
      getAttribute() {
        return this.src;
      }
      removeAttribute() {
        this.src = "";
      }
      load() {
        this.needsLoad = false;
      }
      play() {
        if (this.needsLoad)
          return Promise.reject(
            new DOMException(
              "The operation is not supported",
              "NotSupportedError",
            ),
          );
        this.paused = false;
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    }
    vi.stubGlobal("Audio", MobileAudio);
    save("preferences", { ...defaults, gain: "track" });
    const p = new Player();
    p.replace([{ ...track("one"), trackGain: -6 }, track("two")]);
    await flush();
    expect(audioSession.type).toBe("playback");
    expect(p.state.playing).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(elements[0].crossOrigin).toBeNull();
    elements[0].currentTime = 0.7;
    p.pause();
    expect(p.state.position).toBe(0.7);
    await p.play();
    expect(elements[0].currentTime).toBe(0.7);
    save("preferences", {
      ...defaults,
      gain: "track",
      api: "http://192.168.3.50:8090",
    });
    p.next();
    await flush();
    expect(elements).toHaveLength(1);
    expect(elements[0].src).toContain("/tracks/two/stream");
    expect(elements[0].crossOrigin).toBe("anonymous");
    expect(p.state.index).toBe(1);
    expect(p.state.playing).toBe(true);
  });
  it("does not skip the queue when Safari rejects a media source", async () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    const cancel = vi.fn(async () => {});
    vi.mocked(fetch).mockResolvedValue({
      status: 403,
      headers: new Headers({ "Content-Type": "application/json" }),
      body: { cancel },
    } as unknown as Response);
    let attempts = 0;
    class UnsupportedAudio {
      src = "";
      readyState = 0;
      getAttribute() {
        return this.src;
      }
      removeAttribute() {
        this.src = "";
      }
      load() {}
      pause() {}
      play() {
        attempts++;
        return Promise.reject(
          new DOMException(
            "The operation is not supported",
            "NotSupportedError",
          ),
        );
      }
    }
    vi.stubGlobal("Audio", UnsupportedAudio);
    const p = new Player();
    p.replace(Array.from({ length: 500 }, (_, i) => track(String(i))));
    await flush();
    expect(attempts).toBe(1);
    expect(p.state.index).toBe(0);
    expect(p.state.error).toBe("mediaSourceError");
    expect(p.state.loading).toBe(false);
    expect(p.state.mediaDiagnostics).toContain("HTTP 403");
    expect(p.state.mediaDiagnostics).toContain("application/json");
    expect(p.state.mediaDiagnostics).not.toContain("token=");
    expect(cancel).toHaveBeenCalled();
    await p.play();
    expect(attempts).toBe(2);
    expect(p.state.index).toBe(0);
  });
  it("saves a large queue separately from progress and restores its position", async () => {
    const queue = Array.from({ length: 500 }, (_, i) => track(String(i)));
    save("playback", { queue, index: 450, position: 0.5 });
    const p = new Player();
    expect(p.state.queue).toHaveLength(500);
    expect(p.state.index).toBe(450);
    const writes = vi.spyOn(localStorage, "setItem");
    p.volume(0.6);
    p.volume(0.7);
    await vi.advanceTimersByTimeAsync(5000);
    expect(
      writes.mock.calls.filter(([key]) => key === "harmonia.playback.queue"),
    ).toHaveLength(1);
    expect(load<Record<string, unknown>>("playback", {})).not.toHaveProperty(
      "queue",
    );
    const restored = new Player();
    expect(restored.state.queue).toHaveLength(500);
    expect(restored.state.index).toBe(450);
    expect(restored.state.position).toBe(0.5);
  });
  it("does not let a storage quota error prevent playback", async () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    const p = new Player();
    expect(() => p.replace([track("one")])).not.toThrow();
    await flush();
    expect(p.state.playing).toBe(true);
  });
  it("retains remote queue identity on status-only updates and updates the index", async () => {
    const queue = Array.from({ length: 500 }, (_, i) => track(String(i)));
    const base = {
      configured: true,
      player: { state: "play" },
      index: 450,
      queueVersion: "version-1",
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...base, queue }),
    } as Response);
    const p = new Player();
    await p.syncRemote();
    const reference = p.state.queue;
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...base, index: 451 }),
    } as Response);
    await p.syncRemote();
    expect(p.state.queue).toBe(reference);
    expect(p.state.index).toBe(451);
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain(
      "queueVersion=version-1",
    );
  });
  it("seeks repeatedly with replay gain without refetching or reverting position", async () => {
    save("preferences", { ...defaults, gain: "track", preamp: 2 });
    const p = new Player();
    p.replace([{ ...track("one"), trackGain: -6, trackPeak: 0.8 }]);
    await flush();
    const requests = vi.mocked(fetch).mock.calls.length;
    vi.mocked(fetch).mockRejectedValue(new Error("Network unavailable"));
    p.seek(0.8);
    p.seek(1.2);
    expect(p.state.position).toBe(1.2);
    await vi.advanceTimersByTimeAsync(200);
    expect(p.state.position).toBeCloseTo(1.4);
    expect(p.state.playing).toBe(true);
    expect(p.state.error).toBe("");
    expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
    p.pause();
  });
  it("keeps the requested position while a replacement source is loading", async () => {
    const p = new Player();
    p.replace([track("one"), track("two")]);
    await flush();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    p.select(1);
    p.seek(0.7);
    await vi.advanceTimersByTimeAsync(400);
    expect(p.state.loading).toBe(true);
    expect(p.state.position).toBe(0.7);
    p.pause();
  });
  it("keeps album context through track changes and resets it for other playback sources", async () => {
    const p = new Player();
    p.replace([track("one"), track("two")], 0, "album");
    await flush();
    await vi.advanceTimersByTimeAsync(2100);
    expect(p.state.index).toBe(1);
    expect(p.state.gainContext).toBe("album");
    const restored = new Player();
    expect(restored.state.gainContext).toBe("album");
    p.replace([track("one")]);
    expect(p.state.gainContext).toBe("track");
  });
  it("advances to the correct occurrence when the queue contains repeated tracks", async () => {
    const p = new Player();
    p.replace([track("one"), track("one"), track("two")]);
    await flush();
    await vi.advanceTimersByTimeAsync(2100);
    expect(p.state.index).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.state.index).toBe(2);
    p.pause();
  });
  it("builds a complete queue and schedules the next song at the current song end", async () => {
    const p = new Player();
    p.replace([track("one"), track("two")]);
    await flush();
    expect(p.state.queue).toHaveLength(2);
    expect(p.state.playing).toBe(true);
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBe(2);
    await vi.advanceTimersByTimeAsync(2100);
    expect(p.state.index).toBe(1);
    expect(p.state.playing).toBe(true);
    p.pause();
  });
  it("keeps an internal queue selection and appends without interrupting playback", async () => {
    const p = new Player();
    p.replace([track("one"), track("two")]);
    await flush();
    p.add([track("three")], true);
    await flush();
    expect(p.state.queue.map((t) => t.id)).toEqual(["one", "three", "two"]);
    expect(p.state.index).toBe(0);
    expect(p.state.playing).toBe(true);
    p.select(2);
    await flush();
    expect(p.state.queue).toHaveLength(3);
    expect(p.state.index).toBe(2);
    p.pause();
  });
  it("continues wall-clock sleep countdown while paused and preserves queue/position", async () => {
    const p = new Player();
    p.state = { ...p.state, queue: [track("one")], position: 0.5 };
    p.timer(1 / 60, false);
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.state.deadline).toBe(0);
    expect(p.state.playing).toBe(false);
    expect(p.state.position).toBe(0.5);
    expect(p.state.queue).toHaveLength(1);
  });
  it("lets finish-current-track take priority over repeat and the next song", async () => {
    const p = new Player();
    p.replace([track("one"), track("two")]);
    await flush();
    p.repeat();
    p.timer(1 / 60, true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(p.state.waiting).toBe(true);
    expect(p.state.playing).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(p.state.index).toBe(0);
    expect(p.state.playing).toBe(false);
    expect(p.state.waiting).toBe(false);
    expect(p.state.queue).toHaveLength(2);
  });
  it("cancels end-of-song sleep on manual selection", async () => {
    const p = new Player();
    p.replace([track("one"), track("two")]);
    await flush();
    p.timer(0, true, true);
    p.select(1);
    await flush();
    expect(p.state.waiting).toBe(false);
    expect(p.state.index).toBe(1);
    p.pause();
  });
  it("restores a local queue paused", async () => {
    const p = new Player();
    p.replace([track("one")]);
    await flush();
    p.pause();
    const restored = new Player();
    expect(restored.state.queue[0].id).toBe("one");
    expect(restored.state.playing).toBe(false);
  });
});
