import { Fragment, type ReactNode } from "react";
import { Cover, Modal } from "./components";
import { useApp } from "./context";
import type { TextKey } from "./i18n";
import { duration, formatBytes, type Track } from "./model";

export function TrackDetails({
  track,
  close,
}: {
  track: Track;
  close: () => void;
}) {
  const { t, prefs, lib } = useApp();
  const sourceName = lib.sources.find(
    (source) => source.id === track.sourceId,
  )?.name;
  const filePath = [sourceName, track.path.replace(/\\/g, "/")]
    .filter(Boolean)
    .join("/");
  const date = (value?: number) =>
    value
      ? new Date(value).toLocaleString(
          prefs.language === "zh" ? "zh-CN" : "en-US",
        )
      : "—";
  const rows = (items: [TextKey, ReactNode][]) => (
    <dl className="details-list">
      {items.map(([key, value]) => (
        <Fragment key={key}>
          <dt>{t(key)}</dt>
          <dd>{value || "—"}</dd>
        </Fragment>
      ))}
    </dl>
  );
  const tags = new Map(Object.entries(track.tags || {}));
  return (
    <Modal title={t("details")} close={close}>
      <div className="detail-summary">
        <Cover track={track} />
        <div>
          <h3>{track.title || track.filename}</h3>
          <p>{track.artist || t("unknownArtist")}</p>
        </div>
      </div>
      <section className="track-detail-section">
        <h4>{t("songInformation")}</h4>
        {rows([
          ["artist", track.artist],
          ["album", track.album],
          ["albumArtist", track.albumArtist],
          ["genre", track.genre],
          ["year", track.year || "—"],
          ["disc", track.disc || "—"],
          ["number", track.number || "—"],
        ])}
      </section>
      <section className="track-detail-section">
        <h4>{t("audioAndFile")}</h4>
        {rows([
          ["duration", duration(track.duration)],
          ["audioFormat", track.format.toUpperCase()],
          ["audioBitrate", track.bitrate ? `${track.bitrate} kbps` : "—"],
          [
            "audioSampleRate",
            track.sampleRate
              ? `${(track.sampleRate / 1000).toLocaleString()} kHz`
              : "—",
          ],
          ["fileSize", formatBytes(track.size)],
          ["filename", track.filename],
          ["filePath", filePath],
        ])}
      </section>
      <section className="track-detail-section">
        <h4>{t("listeningHistory")}</h4>
        {rows([
          ["playCount", String(track.playCount)],
          ["lastPlayed", date(track.lastPlayed)],
          ["addedAt", date(track.addedAt)],
        ])}
      </section>
      {tags.size > 0 && (
        <details className="track-detail-section raw-tags">
          <summary>
            {t("rawTags")} <span>{tags.size}</span>
          </summary>
          <dl className="details-list">
            {[...tags]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, values]) => (
                <Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>
                    {values.map((value, index) => (
                      <div
                        className="tag-detail-value"
                        key={`${index}:${value}`}
                      >
                        {value || "—"}
                      </div>
                    ))}
                  </dd>
                </Fragment>
              ))}
          </dl>
        </details>
      )}
    </Modal>
  );
}
