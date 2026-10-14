import { afterEach, expect, it, vi } from "vitest";

vi.mock("./player", () => ({
  player: { replace: vi.fn(), shuffle: vi.fn(), state: { shuffle: false } },
}));

import { playBrowse } from "./browse-api";
import { player } from "./player";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("plays only the server selection, including a start beyond the visible page", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ids: ["149", "150", "151"], limit: 500 })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [{ id: "149" }, { id: "150" }, { id: "151", missing: true }],
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await playBrowse({ section: "songs", page: 4, start: "150" });
  const url = new URL(fetch.mock.calls[0][0], "http://localhost");
  expect(url.pathname).toBe("/api/queue/query");
  expect(JSON.parse(url.searchParams.get("query") ?? "{}")).toMatchObject({
    start: "150",
    page: 4,
  });
  expect(fetch.mock.calls[1][0]).toBe("/api/tracks/resolve");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    ids: ["149", "150", "151"],
  });
  expect(player.replace).toHaveBeenCalledWith(
    [{ id: "149" }, { id: "150" }],
    1,
    "track",
  );
});
it("does not replace playback when selection resolution fails", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Selection changed" }), {
          status: 404,
        }),
    ),
  );
  await expect(playBrowse({ section: "songs", start: "gone" })).rejects.toThrow(
    "Selection changed",
  );
  expect(player.replace).not.toHaveBeenCalled();
});

it("starts shuffle at a random index without rearranging the list", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.spyOn(Math, "random").mockReturnValue(0.75);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ids: ["a", "b", "c"], limit: 500 })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }] }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await playBrowse({ section: "songs", start: "b" }, "album", true);
  const url = new URL(fetch.mock.calls[0][0], "http://localhost");
  expect(JSON.parse(url.searchParams.get("query") ?? "{}")).not.toHaveProperty(
    "start",
  );
  expect(player.shuffle).toHaveBeenCalledOnce();
  expect(player.replace).toHaveBeenCalledWith(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    2,
    "album",
  );
  vi.restoreAllMocks();
});

it("resolves 500 tracks in bounded batches while preserving order and selection", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  const ids = Array.from({ length: 500 }, (_, i) => String(i));
  const items = ids.map((id) => ({ id }));
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ids, limit: 500 })));
  for (let offset = 0; offset < 500; offset += 200) {
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items: items.slice(offset, offset + 200) }),
      ),
    );
  }
  vi.stubGlobal("fetch", fetch);
  await playBrowse({ section: "songs", start: "499" });
  expect(
    fetch.mock.calls
      .slice(1)
      .map((call) => JSON.parse(call[1].body).ids.length),
  ).toEqual([200, 200, 100]);
  expect(player.replace).toHaveBeenCalledWith(items, 499, "track");
});
