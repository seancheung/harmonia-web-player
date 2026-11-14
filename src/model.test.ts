import { describe, expect, it } from "vitest";
import { validateRule } from "./components";
import {
  defaults,
  lyricsLines,
  matches,
  mediaURL,
  replayGain,
  sortTracks,
  splitMembers,
  type Track,
} from "./model";

it("splits configured literal separators while preserving semicolons", () => {
  expect(splitMembers("Rock/Pop; Jazz", "/")).toEqual(["Rock", "Pop", "Jazz"]);
  expect(splitMembers("AC/DC; Rock")).toEqual(["AC/DC", "Rock"]);
  expect(splitMembers("A/B、C; A", "/、")).toEqual(["A", "B", "C"]);
  expect(splitMembers("A]B-C", "]-")).toEqual(["A", "B", "C"]);
});

const makeTrack = (patch: Partial<Track>): Track =>
  ({
    id: "t",
    title: "",
    artist: "",
    album: "",
    genre: "",
    year: 0,
    disc: 0,
    number: 0,
    addedAt: 1,
    playCount: 0,
    favorite: false,
    trackGain: null,
    albumGain: null,
    trackPeak: null,
    albumPeak: null,
    ...patch,
  }) as Track;
describe("library rules", () => {
  it("matches inclusive boundaries and nested OR groups", () => {
    const rule = {
      mode: "any" as const,
      rules: [
        {
          mode: "all" as const,
          rules: [
            { field: "genre", op: "contains", value: "Jazz" },
            { field: "year", op: "gte", value: 2020 },
          ],
        },
        { field: "favorite", op: "eq", value: true },
      ],
    };
    expect(matches(makeTrack({ genre: "Jazz; Soul", year: 2020 }), rule)).toBe(
      true,
    );
    expect(matches(makeTrack({ genre: "Jazz", year: 2019 }), rule)).toBe(false);
    expect(matches(makeTrack({ favorite: true }), rule)).toBe(true);
  });
  it("matches file paths with text operators and normalized separators", () => {
    const track = makeTrack({ path: "Albums/Jazz/01.flac" });
    for (const [op, value, expected] of [
      ["contains", "jazz\\01", true],
      ["notContains", "Rock", true],
      ["eq", "albums/jazz/01.flac", true],
      ["ne", "Albums/Jazz", true],
      ["eq", "Albums/Jazz", false],
      ["notContains", "01.flac", false],
    ] as const) {
      expect(matches(track, { field: "path", op, value })).toBe(expected);
    }
  });
  it("rejects empty groups and invalid numeric conditions", () => {
    expect(validateRule({ mode: "all", rules: [] })).toBe(false);
    expect(validateRule({ field: "year", op: "gte", value: "NaN" })).toBe(
      false,
    );
  });
  it("keeps missing values last in both sort directions with stable tie breaks", () => {
    const items = [
      makeTrack({ id: "unknown" }),
      makeTrack({ id: "z", year: 2020, artist: "Z" }),
      makeTrack({ id: "a", year: 2020, artist: "A" }),
    ];
    expect(sortTracks(items, "year", true).map((t) => t.id)).toEqual([
      "a",
      "z",
      "unknown",
    ]);
    expect(sortTracks(items, "year", false).map((t) => t.id)).toEqual([
      "a",
      "z",
      "unknown",
    ]);
  });
});
describe("playback metadata", () => {
  it("resolves automatic gain from playback context and preserves explicit modes", () => {
    const track = makeTrack({
      trackGain: -3,
      albumGain: -6,
      trackPeak: 1,
      albumPeak: 1,
    });
    const prefs = { ...defaults, gain: "auto" as const };
    expect(replayGain(track, prefs, "album").db).toBeCloseTo(-6);
    expect(replayGain(track, prefs, "track").db).toBeCloseTo(-3);
    expect(replayGain(track, prefs, "track").reason).toBe("gainActive");
    expect(
      replayGain(track, { ...prefs, gain: "track" }, "album").db,
    ).toBeCloseTo(-3);
    expect(
      replayGain(makeTrack({ trackGain: -3, trackPeak: 1 }), prefs, "album")
        .reason,
    ).toBe("fallbackGain");
    expect(replayGain(makeTrack({}), prefs, "album").factor).toBe(1);
  });
  it("falls back to track gain and limits amplitude using peaks", () => {
    const result = replayGain(makeTrack({ trackGain: 6, trackPeak: 0.9 }), {
      ...defaults,
      gain: "album",
    });
    expect(result.mode).toBe("track");
    expect(result.factor).toBeCloseTo(1 / 0.9);
    expect(
      replayGain(makeTrack({}), { ...defaults, gain: "track", preamp: 10 })
        .factor,
    ).toBe(1);
  });
  it("parses multiple lyric timestamps and offsets without inventing timestamps", () => {
    expect(
      lyricsLines("[offset:100]\n[00:01.20][00:03.00]Hello\nPlain text"),
    ).toEqual([
      { time: 1.3, text: "Hello" },
      { time: 3.1, text: "Hello" },
      { time: null, text: "Plain text" },
    ]);
  });
});

it("filters BPM aliases numerically, keys as text, and excludes text case-insensitively", () => {
  const track = makeTrack({
    tags: { tbpm: ["128.5"], initial_key: ["F#m"] },
    artist: "Artist One; Artist Two",
  });
  expect(matches(track, { field: "bpm", op: "gt", value: 120 })).toBe(true);
  expect(matches(track, { field: "key", op: "eq", value: "f#m" })).toBe(true);
  expect(
    matches(track, { field: "artist", op: "notContains", value: "ONE" }),
  ).toBe(false);
  expect(matches(track, { field: "key", op: "notContains", value: "8A" })).toBe(
    true,
  );
  expect(matches(makeTrack({}), { field: "bpm", op: "lt", value: 120 })).toBe(
    false,
  );
  expect(
    matches(makeTrack({}), { field: "key", op: "notContains", value: "8A" }),
  ).toBe(true);
  expect(validateRule({ field: "bpm", op: "gte", value: "invalid" })).toBe(
    false,
  );
});

it("matches empty conditions without requiring a value", () => {
  for (const [field, patch, empty] of [
    ["genre", { genre: "  " }, true],
    ["genre", { genre: "Jazz" }, false],
    ["year", { year: 0 }, true],
    ["playCount", { playCount: 0 }, false],
    ["favorite", { favorite: false }, false],
    ["path", { path: "" }, true],
    ["bpm", { tags: {} }, true],
    ["tag:comment", { tags: {} }, true],
  ] as const) {
    const rule = { field, op: "isEmpty" };
    expect(validateRule(rule)).toBe(true);
    expect(matches(makeTrack(patch), rule)).toBe(empty);
    expect(matches(makeTrack(patch), { ...rule, op: "isNotEmpty" })).toBe(
      !empty,
    );
  }
});

it("matches unified tag arrays with any-positive and none-negative semantics", () => {
  const item = makeTrack({
    tags: {
      mood: ["Calm", "Happy"],
      blank: ["  "],
      bpm: ["bad", "128"],
      initialkey: ["", "F#m"],
    },
  });
  expect(matches(item, { field: "tag:mood", op: "eq", value: "happy" })).toBe(
    true,
  );
  expect(matches(item, { field: "tag:mood", op: "ne", value: "happy" })).toBe(
    false,
  );
  expect(
    matches(item, { field: "tag:mood", op: "notContains", value: "alm" }),
  ).toBe(false);
  expect(matches(item, { field: "tag:absent", op: "ne", value: "happy" })).toBe(
    true,
  );
  expect(matches(item, { field: "tag:blank", op: "isEmpty" })).toBe(true);
  expect(matches(item, { field: "bpm", op: "eq", value: 128 })).toBe(true);
  expect(matches(item, { field: "key", op: "eq", value: "F#m" })).toBe(true);
});

it("uses supplied content URLs without per-track artwork requests", () => {
  const artwork = { url: "/api/artwork/shared", revision: "shared" };
  const first = makeTrack({
    id: "one",
    albumId: "album",
    artwork,
    revision: "audio-v1",
  });
  const second = makeTrack({
    ...first,
    id: "two",
    albumId: "other",
    revision: "audio-v2",
  });
  expect(mediaURL(first, "cover")).toBe(
    mediaURL(second, "cover", { ruleSet: "mobile" }),
  );
  expect(mediaURL(first, "cover")).toContain("/api/artwork/shared?");
  expect(mediaURL(first, "cover")).not.toContain("ruleSet");
  expect(
    mediaURL(
      {
        ...first,
        artwork: { url: "/api/artwork/changed", revision: "changed" },
      },
      "cover",
    ),
  ).not.toBe(mediaURL(first, "cover"));
  expect(mediaURL({ ...first, artwork: null }, "cover")).toBe("");
  expect(
    mediaURL(
      { ...first, artwork: undefined, hasCover: true, artworkRevision: "old" },
      "cover",
    ),
  ).toBe("");
  expect(mediaURL(first)).toContain("/tracks/one/stream?");
});
