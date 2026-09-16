export interface Source {
  folderTimes?: Record<string, { modifiedAt: number; createdAt: number }>;
  id: string;
  name: string;
  path: string;
  keep: string[];
  ignore: string[];
  error: string;
}
export interface Track {
  modifiedAt?: number;
  createdAt?: number;
  id: string;
  sourceId: string;
  path: string;
  filename: string;
  folder: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  albumId: string;
  genre: string;
  year: number;
  disc: number;
  number: number;
  duration: number;
  bitrate: number;
  sampleRate: number;
  format: string;
  addedAt: number;
  modified: number;
  size: number;
  revision: string;
  favorite: boolean;
  playCount: number;
  lastPlayed: number;
  missing: boolean;
  cover: string;
  hasCover?: boolean;
  artworkRevision?: string;
  lyrics: string;
  tags: Record<string, string>;
  tagValues?: Record<string, string[]>;
  trackGain: number | null;
  albumGain: number | null;
  trackPeak: number | null;
  albumPeak: number | null;
}
export interface Rule {
  mode?: "all" | "any";
  rules?: Rule[];
  field?: string;
  op?: string;
  value?: string | number | boolean;
  sourceId?: string;
  recursive?: boolean;
}
export interface Playlist {
  id: string;
  name: string;
  smart: boolean;
  rule?: Rule;
  sort: string;
  desc: boolean;
  tracks: string[];
}
export interface Conversion {
  formats?: string[];
  format: string;
  bitrateOp: string;
  bitrate: number;
  sampleRateOp: string;
  sampleRate: number;
  codec: string;
  outputBitrate: number;
  outputSampleRate: number;
}
export interface RuleSet {
  id: string;
  name: string;
  rules: Conversion[];
}
export interface Library {
  sources: Source[];
  tracks: Track[];
  playlists: Playlist[];
  ruleSets: RuleSet[];
  cacheLimit: number;
  tagSeparators?: string;
}
export interface Preferences {
  language: "en" | "zh";
  theme: "light" | "dark" | "system";
  accent: string;
  background: string;
  foreground: string;
  glass: boolean;
  glassBlur: number;
  glassOpacity: number;
  glassPopups: boolean;
  waveform: boolean;
  gain: "off" | "track" | "album" | "auto";
  preamp: number;
  protect: boolean;
  ruleSet: string;
  failure: "skip" | "stop";
  api: string;
  token: string;
}
export const defaults: Preferences = {
  language: "zh",
  theme: "system",
  accent: "#e5534b",
  background: "",
  foreground: "",
  glass: true,
  glassBlur: 20,
  glassOpacity: 80,
  glassPopups: false,
  waveform: false,
  gain: "off",
  preamp: 0,
  protect: true,
  ruleSet: "",
  failure: "skip",
  api: "",
  token: "",
};
export function load<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(`harmonia.${key}`);
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  localStorage.setItem(`harmonia.${key}`, JSON.stringify(value));
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const p = load("preferences", defaults);
  const res = await fetch(`${p.api}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(p.token ? { Authorization: `Bearer ${p.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const invalidResponse = p.api
    ? "apiInvalidResponse"
    : "apiServerUnconfigured";
  if (res.headers?.get("Content-Type")?.includes("text/html"))
    throw new Error(invalidResponse);
  const data = await res.json().catch(() => {
    throw new Error(invalidResponse);
  });
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const index = Math.max(0, unit);
  const value = bytes / 1024 ** index;
  return `${Number(value.toFixed(index === 0 ? 0 : 2))} ${units[index]}`;
}

export function mediaURL(
  t: Track,
  type = "stream",
  extra: Record<string, string> = {},
) {
  const p = load("preferences", defaults);
  const q = new URLSearchParams({
    token: p.token,
    ruleSet: p.ruleSet,
    v: type === "cover" ? t.artworkRevision || t.revision : t.revision,
    ...extra,
  });
  return `${p.api}/api/tracks/${t.id}/${type}?${q}`;
}
export const splitMembers = (text: string, extra = "") => [
  ...new Set(
    Array.from(text, (char) => (extra.includes(char) ? ";" : char))
      .join("")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export function matches(t: Track, r: Rule): boolean {
  if (r.mode) {
    return r.mode === "all"
      ? (r.rules || []).every((c) => matches(t, c))
      : (r.rules || []).some((c) => matches(t, c));
  }
  if (r.field === "path" && r.op !== "isEmpty" && r.op !== "isNotEmpty") {
    const path = (t.path || "").replace(/\\/g, "/").toLowerCase();
    const query = String(r.value ?? "")
      .replace(/\\/g, "/")
      .toLowerCase();
    switch (r.op) {
      case "contains":
        return path.includes(query);
      case "notContains":
        return !path.includes(query);
      case "eq":
        return path === query;
      case "ne":
        return path !== query;
      default:
        return false;
    }
  }
  const actual =
    r.field === "bpm"
      ? ["bpm", "tbpm", "tempo"]
          .map((key) => Number(t.tags?.[key]?.trim()))
          .find((n) => Number.isFinite(n) && n > 0)
      : r.field === "key"
        ? ["initialkey", "initial_key", "tkey", "key"]
            .map((key) => t.tags?.[key]?.trim())
            .find(Boolean) || ""
        : r.field?.startsWith("tag:")
          ? t.tags?.[r.field.slice(4)]
          : (t as unknown as Record<string, unknown>)[r.field || ""];
  if (r.op === "isEmpty" || r.op === "isNotEmpty") {
    const empty =
      actual == null ||
      (typeof actual === "string" && actual.trim() === "") ||
      (typeof actual === "number" && actual === 0 && r.field !== "playCount");
    return r.op === "isEmpty" ? empty : !empty;
  }
  if (r.field === "bpm" && actual === undefined) return r.op === "ne";
  const a = typeof actual === "string" ? actual.toLowerCase() : (actual ?? "");
  const b =
    typeof actual === "number"
      ? Number(r.value)
      : typeof r.value === "string"
        ? r.value.toLowerCase()
        : (r.value ?? "");
  switch (r.op) {
    case "contains":
      return String(a).includes(String(b));
    case "notContains":
      return !String(a).includes(String(b));
    case "eq":
      return a === b;
    case "ne":
      return a !== b;
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    default:
      return false;
  }
}
export function sortTracks(tracks: Track[], field = "addedAt", desc = true) {
  return [...tracks].sort((a, b) => {
    for (const f of [
      ...new Set([field, "artist", "album", "disc", "number", "title"]),
    ]) {
      const av = (a as unknown as Record<string, string | number>)[f],
        bv = (b as unknown as Record<string, string | number>)[f];
      const am = av === "" || av == null || (av === 0 && f !== "playCount"),
        bm = bv === "" || bv == null || (bv === 0 && f !== "playCount");
      if (am !== bm) return am ? 1 : -1;
      if (am && bm) continue;
      const c =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
      if (c) return f === field && desc ? -c : c;
    }
    return a.id.localeCompare(b.id);
  });
}
export function replayGain(
  t: Track,
  p: Preferences,
  context: "track" | "album" = "track",
) {
  const requested = p.gain === "auto" ? context : p.gain;
  if (p.gain === "off") return { factor: 1, mode: "off", reason: "off", db: 0 };
  let gain = t.trackGain,
    peak = t.trackPeak,
    mode = "track";
  if (requested === "album" && t.albumGain !== null) {
    gain = t.albumGain;
    peak = t.albumPeak;
    mode = "album";
  }
  if (gain === null || !Number.isFinite(gain))
    return { factor: 1, mode: "off", reason: "missingGain", db: 0 };
  let factor = 10 ** ((gain + p.preamp) / 20);
  if (p.protect && peak !== null && peak > 0)
    factor = Math.min(factor, 1 / peak);
  return {
    factor,
    mode,
    db: 20 * Math.log10(factor),
    reason:
      peak === null || peak <= 0
        ? "missingPeak"
        : mode !== requested
          ? "fallbackGain"
          : "gainActive",
  };
}
export const duration = (seconds: number) =>
  `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, "0")}`;
export function lyricsLines(text: string) {
  const lines: { time: number | null; text: string }[] = [];
  let offset = 0;
  const offsetMatch = text.match(/\[offset:([+-]?\d+)\]/);
  if (offsetMatch) offset = Number(offsetMatch[1]) / 1000;
  for (const line of text.split(/\r?\n/)) {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (times.length) {
      for (const t of times)
        lines.push({
          time: Number(t[1]) * 60 + Number(t[2]) + offset,
          text: line.replace(/\[[^\]]*\]/g, "").trim(),
        });
    } else if (line.trim() && !/^\[\w+:/.test(line))
      lines.push({ time: null, text: line });
  }
  return lines.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}
