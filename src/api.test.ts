import { afterEach, expect, it, vi } from "vitest";
import { api, defaults, fetchPlaylists } from "./model";

afterEach(() => vi.unstubAllGlobals());

it.each(["", "http://server:8090"])(
  "explains HTML API responses for server %s",
  async (server) => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ ...defaults, api: server }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html><html></html>", {
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    await expect(api("/library")).rejects.toThrow(
      server ? "apiInvalidResponse" : "apiServerUnconfigured",
    );
  },
);

it("preserves structured server errors", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "apiServerUnconfigured" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  await expect(api("/library")).rejects.toThrow("apiServerUnconfigured");
});

it.each(["all", "normal", "smart"] as const)(
  "fetches %s playlists without the library",
  async (type) => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const fetch = vi.fn(
      async (_url: string, _options?: RequestInit) =>
        new Response(JSON.stringify({ playlists: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPlaylists(type)).resolves.toEqual([]);
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      `/api/playlists?type=${type}`,
    );
  },
);
