import { describe, expect, it, vi } from "vitest";
import { FavoriteUpdates } from "./favorite-updates";
import type { Track } from "./model";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const track = (favorite: boolean) => ({ id: "song", favorite }) as Track;
describe("optimistic favorites", () => {
  it("updates before the server replies and protects in-flight reloads", async () => {
    const pending = deferred<{ favorite: boolean }>();
    const apply = vi.fn();
    const updates = new FavoriteUpdates(() => pending.promise, apply);
    const before = updates.version;
    const task = updates.set("song", true, false);
    expect(apply).toHaveBeenCalledWith("song", true);
    expect(updates.merge([track(false)], updates.version)[0].favorite).toBe(
      true,
    );
    pending.resolve({ favorite: true });
    await task;
    expect(updates.merge([track(false)], before)[0].favorite).toBe(true);
    // A fresh fetch after completion can reflect a change from another client.
    expect(updates.merge([track(false)], updates.version)[0].favorite).toBe(
      false,
    );
  });
  it("rolls back the latest failed save", async () => {
    const apply = vi.fn();
    const updates = new FavoriteUpdates(async () => {
      throw new Error("offline");
    }, apply);
    const task = updates.set("song", true, false);
    await expect(task).rejects.toThrow("offline");
    expect(apply.mock.calls).toEqual([
      ["song", true],
      ["song", false],
    ]);
  });
  it("serializes rapid toggles and rolls back to the last confirmed value", async () => {
    const first = deferred<{ favorite: boolean }>();
    const second = deferred<{ favorite: boolean }>();
    const send = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const apply = vi.fn();
    const updates = new FavoriteUpdates(send, apply);
    const one = updates.set("song", true, false);
    const two = updates.set("song", false, true);
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    first.resolve({ favorite: true });
    await one;
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls).toEqual([
      ["song", true],
      ["song", false],
    ]);
    second.reject(new Error("failed"));
    await expect(two).rejects.toThrow("failed");
    expect(apply).toHaveBeenLastCalledWith("song", true);
  });
  it("does not let an older failed request undo a newer choice", async () => {
    const first = deferred<{ favorite: boolean }>();
    const send = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ favorite: false });
    const apply = vi.fn();
    const updates = new FavoriteUpdates(send, apply);
    const one = updates.set("song", true, false);
    const two = updates.set("song", false, true);
    first.reject(new Error("failed"));
    await Promise.all([one, two]);
    expect(apply.mock.calls).toEqual([
      ["song", true],
      ["song", false],
    ]);
  });
  it("does not serialize unrelated songs", async () => {
    const first = deferred<{ favorite: boolean }>();
    const send = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ favorite: true });
    const updates = new FavoriteUpdates(send, () => {});
    const one = updates.set("one", true, false);
    await updates.set("two", true, false);
    expect(send).toHaveBeenCalledTimes(2);
    first.resolve({ favorite: true });
    await one;
  });
});
