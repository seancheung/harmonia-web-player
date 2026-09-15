import { afterEach, expect, it, vi } from "vitest";
import type { Playback } from "./player";
import {
  prefersMediaElement,
  SystemMedia,
  setPlaybackSession,
} from "./system-media";

afterEach(() => vi.unstubAllGlobals());

it("publishes metadata and routes system controls to the player", () => {
  const handlers = new Map<string, MediaSessionActionHandler>();
  const session = {
    metadata: null,
    playbackState: "none",
    setPositionState: vi.fn(),
    setActionHandler: (name: string, handler: MediaSessionActionHandler) =>
      handlers.set(name, handler),
  };
  vi.stubGlobal("navigator", { mediaSession: session });
  vi.stubGlobal("location", { href: "https://music.example/home" });
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal(
    "MediaMetadata",
    class {
      constructor(data: unknown) {
        Object.assign(this, data);
      }
    },
  );
  const controls = {
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    nexttrack: vi.fn(),
    previoustrack: vi.fn(),
    seek: vi.fn(),
    position: () => 20,
  };
  const media = new SystemMedia(controls);
  const state = {
    queue: [
      {
        id: "one",
        title: "Song",
        artist: "Artist",
        album: "Album",
        duration: 100,
      },
    ],
    index: 0,
    position: 25,
    playing: true,
    remote: false,
  } as Playback;
  media.update(state);
  expect(session.metadata).toMatchObject({
    title: "Song",
    artist: "Artist",
    album: "Album",
  });
  const metadata = session.metadata;
  media.update({ ...state, position: 26 });
  expect(session.metadata).toBe(metadata);
  expect(session.playbackState).toBe("playing");
  expect(session.setPositionState).toHaveBeenLastCalledWith({
    duration: 100,
    position: 26,
    playbackRate: 1,
  });
  handlers.get("pause")?.({ action: "pause" });
  handlers.get("nexttrack")?.({ action: "nexttrack" });
  handlers.get("seekto")?.({ action: "seekto", seekTime: 60 });
  expect(controls.pause).toHaveBeenCalledOnce();
  expect(controls.nexttrack).toHaveBeenCalledOnce();
  expect(controls.seek).toHaveBeenLastCalledWith(60);
  media.update({ ...state, remote: true });
  expect(session.metadata).toBeNull();
  expect(session.playbackState).toBe("none");
});

it("detects touch iPads and tolerates unavailable audio sessions", () => {
  vi.stubGlobal("navigator", {
    userAgent: "Macintosh",
    platform: "MacIntel",
    maxTouchPoints: 5,
  });
  expect(prefersMediaElement()).toBe(true);
  expect(() => setPlaybackSession()).not.toThrow();
  vi.stubGlobal("navigator", {
    userAgent: "Macintosh",
    platform: "MacIntel",
    maxTouchPoints: 0,
    audioSession: {
      set type(_value: string) {
        throw new Error("Unsupported");
      },
    },
  });
  expect(prefersMediaElement()).toBe(false);
  expect(() => setPlaybackSession()).not.toThrow();
});
