import { expect, it } from "vitest";
import type { Playlist } from "./model";
import { PlaylistRefresh } from "./playlist-refresh";

const playlists: Playlist[] = [
  {
    id: "favorites",
    name: "Favorites",
    smart: true,
    rule: {
      mode: "all",
      rules: [{ field: "favorite", op: "eq", value: true }],
    },
  },
  { id: "sorted", name: "Sorted", smart: true, sort: "favorite" },
  {
    id: "genre",
    name: "Rock",
    smart: true,
    rule: { field: "genre", op: "eq", value: "rock" },
  },
  { id: "manual", name: "Manual", smart: false },
] as Playlist[];

it("refreshes only favorite-dependent membership and sorting after a favorite write", () => {
  const scheduler = new PlaylistRefresh();
  scheduler.commit(scheduler.plan(playlists, 1, 0));
  expect(scheduler.plan(playlists, 1, 1).ids).toEqual(["favorites", "sorted"]);
});

it("keeps canceled full and definition refreshes pending", () => {
  const scheduler = new PlaylistRefresh();
  scheduler.plan(playlists, 1, 0); // aborted
  expect(scheduler.plan(playlists, 1, 1).ids).toEqual([
    "favorites",
    "sorted",
    "genre",
  ]);
  scheduler.commit(scheduler.plan(playlists, 1, 1));
  const changed = playlists.map((p) =>
    p.id === "genre"
      ? { ...p, rule: { field: "genre", op: "eq", value: "jazz" } }
      : p,
  );
  expect(scheduler.plan(changed, 1, 1).ids).toEqual(["genre"]);
  expect(scheduler.plan(changed, 1, 2).ids).toEqual([
    "favorites",
    "sorted",
    "genre",
  ]);
});

it("ignores renames and deletions, refreshes new definitions and library changes", () => {
  const scheduler = new PlaylistRefresh();
  scheduler.commit(scheduler.plan(playlists, 1, 0));
  const renamed = playlists.map((p) => ({ ...p, name: "new name" }));
  expect(scheduler.plan(renamed, 1, 0).ids).toEqual([]);
  const removed = playlists.filter((p) => p.id !== "genre");
  const plan = scheduler.plan(removed, 1, 0);
  expect(plan.ids).toEqual([]);
  scheduler.commit(plan);
  expect(scheduler.plan(playlists, 1, 0).ids).toEqual(["genre"]);
  expect(scheduler.plan(playlists, 2, 0).ids).toEqual([
    "favorites",
    "sorted",
    "genre",
  ]);
});
