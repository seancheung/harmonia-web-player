import { afterEach, expect, it, vi } from "vitest";
import { api, defaults } from "./model";

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
