import { afterEach, expect, it, vi } from "vitest";

vi.mock("./player", () => ({ player: { replace: vi.fn() } }));

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
      new Response(JSON.stringify({ ids: ["150", "151"], limit: 100 })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [{ id: "150" }, { id: "151", missing: true }],
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
    ids: ["150", "151"],
  });
  expect(player.replace).toHaveBeenCalledWith([{ id: "150" }], 0, "track");
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
