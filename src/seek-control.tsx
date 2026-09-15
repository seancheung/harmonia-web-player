import { type CSSProperties, useEffect, useId, useState } from "react";
import { useApp } from "./context";
import { duration, mediaURL, type Track } from "./model";
import { player } from "./player";

export function SeekControl({
  track,
  position,
}: {
  track?: Track;
  position: number;
}) {
  const { t, prefs } = useApp();
  const [waveform, setWaveform] = useState<{ url: string; peaks: number[] }>();
  const clip = useId();
  const url = prefs.waveform && track ? mediaURL(track, "waveform") : "";
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("waveform unavailable");
        const data = await response.json();
        if (
          !Array.isArray(data.peaks) ||
          data.peaks.length !== 512 ||
          !data.peaks.every(
            (v: unknown) =>
              typeof v === "number" &&
              Number.isFinite(v) &&
              v >= 0 &&
              v <= 1000,
          )
        )
          return;
        if (!controller.signal.aborted) setWaveform({ url, peaks: data.peaks });
      })
      .catch(() => {
        /* Keep the standard seek control when unavailable. */
      });
    return () => controller.abort();
  }, [url]);
  const peaks = url && waveform?.url === url ? waveform.peaks : undefined;
  const progress = track?.duration
    ? Math.max(0, Math.min(100, (position / track.duration) * 100))
    : 0;
  const input = (
    <input
      aria-label={t("seek")}
      aria-valuetext={`${duration(position)} / ${duration(track?.duration || 0)}`}
      style={{ "--progress": `${progress}%` } as CSSProperties}
      type="range"
      disabled={!track}
      min="0"
      max={track?.duration || 1}
      step="0.1"
      value={Math.min(position, track?.duration || 1)}
      onChange={(event) => player.seek(Number(event.target.value))}
    />
  );
  if (!peaks) return input;
  const path = Array.from({ length: 128 }, (_, i) => {
    const height = Math.max(
      2,
      (Math.max(...peaks.slice(i * 4, i * 4 + 4)) / 1000) * 30,
    );
    return `M${i * 4} ${16 - height / 2}h2.5v${height}h-2.5Z`;
  }).join(" ");
  return (
    <div className="waveform-seek">
      <svg viewBox="0 0 512 32" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <rect width={progress * 5.12} height="32" />
          </clipPath>
        </defs>
        <path d={path} fill="var(--muted)" opacity="0.45" />
        <path d={path} fill="var(--accent)" clipPath={`url(#${clip})`} />
      </svg>
      {input}
    </div>
  );
}
