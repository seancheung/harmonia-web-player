import { mediaURL } from "./model";
import type { Playback } from "./player";

export function prefersMediaElement() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function setPlaybackSession() {
  if (typeof navigator === "undefined") return;
  const session = (
    navigator as Navigator & {
      audioSession?: { type: string };
    }
  ).audioSession;
  try {
    if (session) session.type = "playback";
  } catch {
    // Audio Session is optional and must not prevent playback.
  }
}

interface Controls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  nexttrack: () => void;
  previoustrack: () => void;
  seek: (position: number) => void;
  position: () => number;
}

export class SystemMedia {
  private signature = "";
  private session =
    typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  constructor(controls: Controls) {
    if (!this.session) return;
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: controls.play,
      pause: controls.pause,
      stop: controls.stop,
      nexttrack: controls.nexttrack,
      previoustrack: controls.previoustrack,
      seekto: (details) => {
        if (details.seekTime !== undefined) controls.seek(details.seekTime);
      },
      seekbackward: (details) =>
        controls.seek(controls.position() - (details.seekOffset ?? 10)),
      seekforward: (details) =>
        controls.seek(controls.position() + (details.seekOffset ?? 10)),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        this.session.setActionHandler(action as MediaSessionAction, handler);
      } catch {
        // Browsers support different subsets of media actions.
      }
    }
  }
  update(state: Playback) {
    if (!this.session) return;
    const track = state.remote ? undefined : state.queue[state.index];
    try {
      if (!track) {
        this.session.metadata = null;
        this.session.playbackState = "none";
        this.session.setPositionState?.();
        this.signature = "";
        return;
      }
      const artwork = track.hasCover === false ? "" : mediaURL(track, "cover");
      const signature = JSON.stringify([
        track.id,
        track.title,
        track.artist,
        track.album,
        artwork,
      ]);
      if (
        signature !== this.signature &&
        typeof MediaMetadata !== "undefined"
      ) {
        this.session.metadata = new MediaMetadata({
          title: track.title || track.filename,
          artist: track.artist,
          album: track.album,
          artwork: artwork
            ? [{ src: new URL(artwork, location.href).href }]
            : [],
        });
        this.signature = signature;
      }
      this.session.playbackState = state.playing ? "playing" : "paused";
      if (Number.isFinite(track.duration) && track.duration > 0) {
        this.session.setPositionState?.({
          duration: track.duration,
          playbackRate: 1,
          position: Math.max(0, Math.min(track.duration, state.position || 0)),
        });
      } else this.session.setPositionState?.();
    } catch {
      // System controls are optional; unsupported metadata must not stop audio.
    }
  }
}
