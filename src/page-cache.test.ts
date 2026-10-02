import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaults } from "./model";
import { cachedPage, fetchPage, invalidatePages } from "./page-cache";

let preferences = { ...defaults };
beforeEach(() => {
  preferences = {
    ...defaults,
    api: `https://${crypto.randomUUID()}.invalid`,
    token: "first",
  };
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(preferences) });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());
const response = (data: unknown, etag = '"v1"') =>
  new Response(JSON.stringify(data), { headers: { ETag: etag } });
it("revalidates cached pages with ETag and preserves cached data after failure", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ items: ["a"] }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
    .mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  const first = await fetchPage("/home");
  expect(await cachedPage("/home")).toEqual(first);
  expect(await fetchPage("/home")).toBe(first);
  expect(fetch.mock.calls[1][1].headers["If-None-Match"]).toBe('"v1"');
  await expect(fetchPage("/home")).rejects.toThrow("offline");
  expect(await cachedPage("/home")).toEqual(first);
});
it("isolates queries, accounts and server addresses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response({ items: ["private"] })),
  );
  await fetchPage("/browse?page=1");
  expect(await cachedPage("/browse?page=2")).toBeUndefined();
  preferences.token = "second";
  expect(await cachedPage("/browse?page=1")).toBeUndefined();
  preferences.token = "first";
  preferences.api = "https://another.invalid";
  expect(await cachedPage("/browse?page=1")).toBeUndefined();
});
it("coalesces concurrent reads but discards stale cache writes after mutation", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(response({ value: "new" }));
  vi.stubGlobal("fetch", fetch);
  const old = fetchPage("/home"),
    duplicate = fetchPage("/home");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  invalidatePages();
  await fetchPage("/home");
  finish(response({ value: "old" }));
  await Promise.all([old, duplicate]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await cachedPage("/home")).toEqual({ value: "new" });
});
