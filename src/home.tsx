import { Link } from "@tanstack/react-router";
import { ChevronRight, Play } from "lucide-react";
import { type HomePageData, playBrowse } from "./browse-api";
import { Cover, IconButton } from "./components";
import { useApp } from "./context";
import type { TextKey } from "./i18n";
import { LibrarySkeleton } from "./library-skeleton";
import { splitMembers as splitTagMembers, type Track } from "./model";
import { usePage } from "./page-cache";
import { player } from "./player";
import { ThemeToggle } from "./theme-toggle";

export function HomePage() {
  const { lib, t, notice } = useApp();
  const {
    data,
    loading: busy,
    error,
    refresh: reload,
  } = usePage<HomePageData>("/home");
  const splitMembers = (text: string) =>
    splitTagMembers(text, lib.tagSeparators || "");
  const recent = data?.recent || [],
    frequent = data?.frequent || [],
    unheard = data?.unheard || [],
    topArtists = data?.artists || [];
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
        <ThemeToggle />
      </div>
      <div className="page-content home-page">
        {busy ? (
          <LibrarySkeleton variant="home" label={t("loadingLibrary")} />
        ) : error && !data ? (
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
        ) : !data?.total ? (
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
                        <Cover track={artist.tracks[0]} />
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
                          void playBrowse({
                            section: "artists",
                            detail: artist.id,
                          }).catch((e) => notice(e.message))
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
