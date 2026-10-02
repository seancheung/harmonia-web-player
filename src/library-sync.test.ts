import { afterEach, expect, it, vi } from "vitest";
import { syncLibrary } from "./library-sync";
import type { Library, Track } from "./model";

afterEach(() => vi.unstubAllGlobals());
const track = (id: string, title = id) => ({ id, title }) as Track;
const initial: Library = {
  tracks: [track("a"), track("b")],
  playlists: [],
  sources: [],
  ruleSets: [],
  cacheLimit: 0,
  syncCursor: "epoch:1",
};
function responses(values: unknown[]) {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const fetch = vi.fn(
    async (_url: string, _options?: RequestInit) =>
      new Response(JSON.stringify(values.shift()), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("merges additions, edits, removals and metadata without a full request", async () => {
  const fetch = responses([
    {
      syncCursor: "epoch:2",
      reset: false,
      tracks: [track("a", "updated"), track("c")],
      removed: ["b"],
      metadata: {
        playlists: [],
        sources: [],
        ruleSets: [],
        cacheLimit: 5,
        tracks: null,
      },
    },
  ]);
  const result = await syncLibrary(initial);
  expect(result.tracks.map((t) => t.title)).toEqual(["updated", "c"]);
  expect(result.cacheLimit).toBe(5);
  expect(initial.tracks[0].title).toBe("a");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain("/library/changes?since=epoch%3A1");
});
it("preserves object identity when nothing changed", async () => {
  responses([{ syncCursor: "epoch:1", reset: false, tracks: [], removed: [] }]);
  expect(await syncLibrary(initial)).toBe(initial);
});
it("loads a snapshot only on initialization or explicit reset", async () => {
  const fetch = responses([
    initial,
    { syncCursor: "new:0", reset: true, tracks: [], removed: [] },
    { ...initial, syncCursor: "new:0" },
  ]);
  await syncLibrary({ ...initial, syncCursor: undefined });
  await syncLibrary(initial);
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    "/api/library",
    "/api/library/changes?since=epoch%3A1",
    "/api/library",
  ]);
});
it("does not silently fall back to a full download on network failure", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  await expect(syncLibrary(initial)).rejects.toThrow("offline");
  expect(fetch).toHaveBeenCalledTimes(1);
});
