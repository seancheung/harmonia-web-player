import { describe, expect, it } from "vitest";
import { validateRule } from "./components";
import {
  defaults,
  lyricsLines,
  matches,
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

const track = (patch: Partial<Track>): Track =>
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
    expect(matches(track({ genre: "Jazz; Soul", year: 2020 }), rule)).toBe(
      true,
    );
    expect(matches(track({ genre: "Jazz", year: 2019 }), rule)).toBe(false);
    expect(matches(track({ favorite: true }), rule)).toBe(true);
  });
  it("matches file paths with text operators and normalized separators", () => {
    const song = track({ path: "Albums/Jazz/01.flac" });
    for (const [op, value, expected] of [
      ["contains", "jazz\\01", true],
      ["notContains", "Rock", true],
      ["eq", "albums/jazz/01.flac", true],
      ["ne", "Albums/Jazz", true],
      ["eq", "Albums/Jazz", false],
      ["notContains", "01.flac", false],
    ] as const) {
      expect(matches(song, { field: "path", op, value })).toBe(expected);
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
      track({ id: "unknown" }),
      track({ id: "z", year: 2020, artist: "Z" }),
      track({ id: "a", year: 2020, artist: "A" }),
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
    const song = track({
      trackGain: -3,
      albumGain: -6,
      trackPeak: 1,
      albumPeak: 1,
    });
    const prefs = { ...defaults, gain: "auto" as const };
    expect(replayGain(song, prefs, "album").db).toBeCloseTo(-6);
    expect(replayGain(song, prefs, "track").db).toBeCloseTo(-3);
    expect(replayGain(song, prefs, "track").reason).toBe("gainActive");
    expect(
      replayGain(song, { ...prefs, gain: "track" }, "album").db,
    ).toBeCloseTo(-3);
    expect(
      replayGain(track({ trackGain: -3, trackPeak: 1 }), prefs, "album").reason,
    ).toBe("fallbackGain");
    expect(replayGain(track({}), prefs, "album").factor).toBe(1);
  });
  it("falls back to track gain and limits amplitude using peaks", () => {
    const result = replayGain(track({ trackGain: 6, trackPeak: 0.9 }), {
      ...defaults,
      gain: "album",
    });
    expect(result.mode).toBe("track");
    expect(result.factor).toBeCloseTo(1 / 0.9);
    expect(
      replayGain(track({}), { ...defaults, gain: "track", preamp: 10 }).factor,
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
  const song = track({
    tags: { tbpm: "128.5", initial_key: "F#m" },
    artist: "Artist One; Artist Two",
  });
  expect(matches(song, { field: "bpm", op: "gt", value: 120 })).toBe(true);
  expect(matches(song, { field: "key", op: "eq", value: "f#m" })).toBe(true);
  expect(
    matches(song, { field: "artist", op: "notContains", value: "ONE" }),
  ).toBe(false);
  expect(matches(song, { field: "key", op: "notContains", value: "8A" })).toBe(
    true,
  );
  expect(matches(track({}), { field: "bpm", op: "lt", value: 120 })).toBe(
    false,
  );
  expect(
    matches(track({}), { field: "key", op: "notContains", value: "8A" }),
  ).toBe(true);
  expect(validateRule({ field: "bpm", op: "gte", value: "invalid" })).toBe(
    false,
  );
});
