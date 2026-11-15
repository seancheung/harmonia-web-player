import { Link } from "@tanstack/react-router";
import { ChevronRight, Play } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  type BrowsePage,
  browsePath,
  type HomePageData,
  playBrowse,
} from "./browse-api";
import { Cover, IconButton } from "./components";
import { useApp } from "./context";
import type { TextKey } from "./i18n";
import { LibrarySkeleton } from "./library-skeleton";
import type { Track } from "./model";
import { usePage } from "./page-cache";
import { player } from "./player";
import { PlayingArtworkStatus } from "./playing-waveform";
import { ThemeToggle } from "./theme-toggle";

export function HomePage() {
  const { t, notice } = useApp();
  const playback = useSyncExternalStore(player.subscribe, player.snapshot);
  const {
    data,
    loading: busy,
    error,
    refresh: reload,
  } = usePage<HomePageData>("/home");
  const recentAlbums = usePage<BrowsePage>(
    browsePath({
      section: "albums",
      sort: "lastAddedAt",
      desc: true,
      pageSize: 8,
    }),
  );
  const frequent = data?.frequent || [],
    unheard = data?.unheard || [],
    topArtists = data?.artists || [];
  const trackSection = (title: TextKey, tracks: Track[]) => (
    <section className="home-section" aria-label={t(title)}>
      <div className="home-section-heading">
        <h2>{t(title)}</h2>
        <Link
          to="/$section"
          params={{ section: "tracks" }}
          search={{ preset: title }}
        >
          {t("viewAll")}
        </Link>
      </div>
      {tracks.length ? (
        <div className="home-tracks">
          {tracks.map((track, index) => (
            <article className="home-track" key={track.id}>
              <button
                className="track-art home-cover"
                type="button"
                aria-label={`${t("play")} ${track.title || track.filename}`}
                onClick={() => player.replace(tracks, index)}
              >
                <Cover track={track} />
                {playback.queue[playback.index]?.id === track.id ? (
                  <PlayingArtworkStatus
                    playing={playback.playing}
                    label={t(playback.playing ? "queuePlaying" : "queuePaused")}
                  />
                ) : (
                  <Play size={20} fill="currentColor" aria-hidden="true" />
                )}
              </button>
              <div className="home-track-copy">
                <button
                  className="home-title"
                  type="button"
                  onClick={() => player.replace(tracks, index)}
                >
                  {track.title || track.filename}
                </button>
                <div className="home-artists">
                  {(track.artists || []).map(({ id, name }, i) => (
                    <span key={id}>
                      {i > 0 && " / "}
                      <Link
                        to="/$section/$detail"
                        params={{ section: "artists", detail: id }}
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
          {t(title === "unheard" ? "allTracksHeard" : "noListeningHistory")}
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
            <section className="home-section" aria-label={t("lastAddedAt")}>
              <div className="home-section-heading">
                <h2>{t("lastAddedAt")}</h2>
                <Link
                  to="/$section"
                  params={{ section: "albums" }}
                  search={{ preset: "recentlyAdded" }}
                >
                  {t("viewAll")}
                </Link>
              </div>
              {recentAlbums.loading ? (
                <LibrarySkeleton
                  variant="home-albums"
                  label={t("loadingLibrary")}
                />
              ) : recentAlbums.error && !recentAlbums.data ? (
                <div role="alert">
                  <p>
                    {t(recentAlbums.error as TextKey) || recentAlbums.error}
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void recentAlbums.refresh()}
                  >
                    {t("retry")}
                  </button>
                </div>
              ) : (
                <div className="home-tracks">
                  {recentAlbums.data?.groups.map((album) => (
                    <article className="home-track" key={album.id}>
                      <button
                        className="track-art home-cover"
                        type="button"
                        aria-label={`${t("play")} ${album.name || t("unknownAlbum")}`}
                        onClick={() =>
                          void playBrowse(
                            {
                              section: "albums",
                              detail: album.id,
                              sort: "number",
                            },
                            "album",
                          ).catch((e) => notice(e.message))
                        }
                      >
                        <Cover
                          track={album.tracks[0]}
                          artwork={album.artwork ?? null}
                        />
                        <Play
                          size={20}
                          fill="currentColor"
                          aria-hidden="true"
                        />
                      </button>
                      <div className="home-track-copy">
                        <Link
                          className="home-title"
                          to="/$section/$detail"
                          params={{ section: "albums", detail: album.id }}
                        >
                          <strong>{album.name || t("unknownAlbum")}</strong>
                        </Link>
                        <div className="home-artists">
                          {(album.artists || []).map(({ id, name }, index) => (
                            <span key={id}>
                              {index > 0 && " / "}
                              <Link
                                to="/$section/$detail"
                                params={{ section: "artists", detail: id }}
                              >
                                {name}
                              </Link>
                            </span>
                          ))}
                        </div>
                        <span>
                          {album.year || t("unknownYear")} · {album.count}{" "}
                          {t("tracks")}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            {trackSection("topTracks", frequent)}
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
                      key={artist.id}
                    >
                      <Link
                        className="group-cover"
                        to="/$section/$detail"
                        params={{ section: "artists", detail: artist.id }}
                      >
                        <Cover
                          track={artist.tracks[0]}
                          artwork={artist.artwork ?? null}
                        />
                      </Link>
                      <div className="group-copy">
                        <Link
                          to="/$section/$detail"
                          params={{ section: "artists", detail: artist.id }}
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
            {trackSection("unheard", unheard)}
          </>
        )}
      </div>
    </>
  );
}
