import type { TextKey } from "./i18n";
import { formatBytes, type Track } from "./model";

export const songColumns = [
  { id: "albumArtist", label: "albumArtist" },
  { id: "genre", label: "genre" },
  { id: "format", label: "audioFormat" },
  { id: "bitrate", label: "audioBitrate" },
  { id: "sampleRate", label: "audioSampleRate" },
  { id: "playCount", label: "playCount" },
  { id: "addedAt", label: "addedAt" },
  { id: "lastPlayed", label: "lastPlayed" },
  { id: "size", label: "fileSize" },
] as const satisfies readonly { id: keyof Track; label: TextKey }[];
export type SongColumn = (typeof songColumns)[number]["id"];
export function songColumnValue(
  track: Track,
  column: SongColumn,
  language: string,
) {
  switch (column) {
    case "addedAt":
    case "lastPlayed":
      return track[column]
        ? new Date(track[column]).toLocaleString(
            language === "zh" ? "zh-CN" : "en-US",
          )
        : "—";
    case "size":
      return formatBytes(track.size);
    case "bitrate":
      return track.bitrate ? `${track.bitrate} kbps` : "—";
    case "sampleRate":
      return track.sampleRate ? `${track.sampleRate / 1000} kHz` : "—";
    case "format":
      return track.format.toUpperCase() || "—";
    case "playCount":
      return String(track.playCount);
    default:
      return track[column] || "—";
  }
}
