import { Link } from "@tanstack/react-router";
import { ChevronRight, Play } from "lucide-react";
import { useMemo } from "react";
import { Cover, IconButton } from "./components";
import { useApp } from "./context";
import type { TextKey } from "./i18n";
import { splitMembers as splitTagMembers, type Track } from "./model";
import { player } from "./player";

export function HomePage() {
  const { lib, t, busy, error, reload } = useApp();
  const splitMembers = (text: string) =>
    splitTagMembers(text, lib.tagSeparators || "");
  const tracks = lib.tracks.filter((track) => !track.missing);
  const unheard = useMemo(() => {
    const candidates = lib.tracks.filter(
      (track) => !track.missing && track.playCount === 0,
    );
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, 8);
  }, [lib.tracks]);
  const recent = [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8);
  const frequent = tracks
    .filter((track) => track.playCount > 0)
    .sort((a, b) => b.playCount - a.playCount || b.lastPlayed - a.lastPlayed)
    .slice(0, 8);
  const artists = new Map<
    string,
    { name: string; count: number; track: Track }
  >();
  for (const track of tracks) {
    if (!track.playCount) continue;
    for (const name of new Set(splitMembers(track.artist))) {
      const key = name.toLowerCase();
      const artist = artists.get(key);
      if (artist) artist.count += track.playCount;
      else artists.set(key, { name, count: track.playCount, track });
    }
  }
  const topArtists = [...artists.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const songSection = (title: TextKey, songs: Track[]) => (
    <section className="home-section" aria-label={t(title)}>
      <div className="home-section-heading">
        <h2>{t(title)}</h2>
        <Link
          to="/$section"
          params={{ section: "songs" }}
          search={{ preset: title }}
        >
          {t("viewAll")}
        </Link>
      </div>
      {songs.length ? (
        <div className="home-songs">
          {songs.map((track, index) => (
            <article className="home-song" key={track.id}>
              <button
                className="song-art home-cover"
                type="button"
                aria-label={`${t("play")} ${track.title || track.filename}`}
                onClick={() => player.replace(songs, index)}
              >
                <Cover track={track} />
                <Play size={20} fill="currentColor" aria-hidden="true" />
              </button>
              <div className="home-song-copy">
                <button
                  className="home-title"
                  type="button"
                  onClick={() => player.replace(songs, index)}
                >
                  {track.title || track.filename}
                </button>
                <div className="home-artists">
                  {splitMembers(track.artist).map((name, i) => (
                    <span key={name}>
                      {i > 0 && " / "}
                      <Link
                        to="/$section/$detail"
                        params={{ section: "artists", detail: name }}
                      >
                        {name}
                      </Link>
                    </span>
                  ))}
                </div>
                <Link
                  to="/$section/$detail"
                  params={{ section: "albums", detail: track.albumId }}
                >
                  {track.album || t("unknownAlbum")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="home-empty">
          {t(title === "unheard" ? "allSongsHeard" : "noListeningHistory")}
        </p>
      )}
    </section>
  );
  return (
    <>
      <div className="topbar">
        <nav className="breadcrumb" aria-label={t("breadcrumb")}>
          <span>Harmonia</span>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">{t("home")}</span>
        </nav>
      </div>
      <div className="page-content home-page">
        {busy ? (
          <p role="status">{t("loadingLibrary")}</p>
        ) : error ? (
          <div role="alert">
            <p>{t(error as TextKey) || error}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => void reload()}
            >
              {t("retry")}
            </button>
          </div>
        ) : !tracks.length ? (
          <div className="empty-state">
            <h2>{t("empty")}</h2>
            <p>{t("emptyHint")}</p>
            <Link
              to="/$section"
              params={{ section: "settings" }}
              className="primary"
            >
              {t("openSettings")}
            </Link>
          </div>
        ) : (
          <>
            {songSection("recentlyAdded", recent)}
            {songSection("topSongs", frequent)}
            <section className="home-section" aria-label={t("topArtists")}>
              <div className="home-section-heading">
                <h2>{t("topArtists")}</h2>
                <Link
                  to="/$section"
                  params={{ section: "artists" }}
                  search={{ preset: "topArtists" }}
                >
                  {t("viewAll")}
                </Link>
              </div>
              {topArtists.length ? (
                <div className="album-grid home-artist-grid">
                  {topArtists.map((artist) => (
                    <article
                      className="group-card artist-card home-artist"
                      key={artist.name}
                    >
                      <Link
                        className="group-cover"
                        to="/$section/$detail"
                        params={{ section: "artists", detail: artist.name }}
                      >
                        <Cover track={artist.track} />
                      </Link>
                      <div className="group-copy">
                        <Link
                          to="/$section/$detail"
                          params={{ section: "artists", detail: artist.name }}
                        >
                          <strong>{artist.name}</strong>
                        </Link>
                      </div>
                      <IconButton
                        label={`${t("play")} ${artist.name}`}
                        onClick={() =>
                          player.replace(
                            tracks.filter((track) =>
                              splitMembers(track.artist).some(
                                (name) =>
                                  name.toLowerCase() ===
                                  artist.name.toLowerCase(),
                              ),
                            ),
                          )
                        }
                      >
                        <Play size={18} />
                      </IconButton>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="home-empty">{t("noListeningHistory")}</p>
              )}
            </section>
            {songSection("unheard", unheard)}
          </>
        )}
      </div>
    </>
  );
}
