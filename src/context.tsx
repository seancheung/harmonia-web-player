import {
  createContext,
  type ReactNode,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { errorMessage } from "./errors";
import { FavoriteUpdates } from "./favorite-updates";
import { en, type TextKey, zh } from "./i18n";
import { syncLibrary } from "./library-sync";
import {
  api,
  defaults,
  fetchPlaylists,
  type Library,
  load,
  type Playlist,
  type Preferences,
  save,
} from "./model";
import { player } from "./player";
import { useSmartPlaylists } from "./smart-playlists";

interface Context {
  lib: Library;
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  reload: (throwOnError?: boolean) => Promise<void>;
  reloadPlaylists: (type?: "all" | "normal" | "smart") => Promise<void>;
  t: (key: TextKey) => string;
  notice: (text: string) => void;
  error: string;
  busy: boolean;
  run: (
    fn: () => Promise<unknown>,
    scope?: "library" | "playlists",
  ) => Promise<boolean>;
  setFavorite: (id: string, favorite: boolean) => Promise<void>;
  savePlaylist: (playlist: Partial<Playlist>, id?: string) => Promise<boolean>;
  smartPlaylists: Record<string, string[]>;
  playlistsRefreshing: boolean;
  playlistError: string;
}
const Ctx = createContext<Context | null>(null);
export const useApp = () => {
  const context = useContext(Ctx);
  if (!context) throw new Error("AppProvider is required");
  return context;
};
export function AppProvider({ children }: { children: ReactNode }) {
  const [lib, setLib] = useState<Library>({
    sources: [],
    tracks: [],
    playlists: [],
    ruleSets: [],
    cacheLimit: 0,
  });
  const [prefs, updatePrefs] = useState<Preferences>(() => ({
    ...defaults,
    ...load("preferences", {}),
  }));
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(true);
  const libRef = useRef(lib);
  libRef.current = lib;
  const reloadVersion = useRef(0);
  const libraryConnection = useRef("");
  const playlistVersion = useRef(0);
  const favoriteUpdates = useRef<FavoriteUpdates>();
  if (!favoriteUpdates.current) {
    favoriteUpdates.current = new FavoriteUpdates(
      (id, favorite) => api(`/tracks/${id}/favorite`, "PUT", { favorite }),
      (id, favorite) => {
        setLib((current) => ({
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === id ? { ...track, favorite } : track,
          ),
        }));
        player.setFavorite(id, favorite);
      },
    );
  }
  const [serverRevision, setServerRevision] = useState(0);
  const [favoriteRevision, setFavoriteRevision] = useState(0);
  const pendingFavorites = useRef(0);
  const playlistState = useSmartPlaylists(
    lib.playlists,
    serverRevision,
    favoriteRevision,
  );
  const favorites = favoriteUpdates.current;
  const t = (key: TextKey) => (prefs.language === "zh" ? zh : en)[key];
  const setPrefs = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...load("preferences", {}), ...patch };
    save("preferences", next);
    updatePrefs(next);
  };
  async function reload(throwOnError = false) {
    const version = favorites.version;
    const request = ++reloadVersion.current;
    const playlistsAtStart = playlistVersion.current;
    try {
      const connection = load("preferences", defaults);
      const key = JSON.stringify([connection.api, connection.token]);
      const previous = libRef.current;
      const data = await syncLibrary(
        libraryConnection.current === key
          ? previous
          : { ...previous, syncCursor: undefined },
      );
      if (request !== reloadVersion.current) return;
      const latest = load("preferences", defaults);
      if (key !== JSON.stringify([latest.api, latest.token])) return;
      libraryConnection.current = key;
      if (data === previous) {
        setError("");
        return;
      }
      const tracksChanged = data.tracks !== previous.tracks;
      data.tracks = tracksChanged
        ? favorites.merge(data.tracks, version)
        : libRef.current.tracks;
      if (playlistsAtStart !== playlistVersion.current)
        data.playlists = libRef.current.playlists;
      libRef.current = data;
      setLib(data);
      setServerRevision((revision) => revision + 1);
      if (tracksChanged) player.reconcile(data.tracks);
      setError("");
    } catch (e) {
      if (request !== reloadVersion.current) return;
      setError(errorMessage(e));
      if (throwOnError) throw e;
    } finally {
      if (request === reloadVersion.current) setBusy(false);
    }
  }
  async function reloadPlaylists(type: "all" | "normal" | "smart" = "all") {
    const request = ++playlistVersion.current;
    const connection = load("preferences", defaults);
    const key = JSON.stringify([connection.api, connection.token]);
    try {
      const playlists = await fetchPlaylists(type);
      const latest = load("preferences", defaults);
      if (
        request !== playlistVersion.current ||
        key !== JSON.stringify([latest.api, latest.token])
      )
        return;
      setLib((current) => ({
        ...current,
        playlists:
          type === "all"
            ? playlists
            : [
                ...current.playlists.filter((p) =>
                  type === "normal" ? p.smart : !p.smart,
                ),
                ...playlists,
              ],
      }));
      setServerRevision((revision) => revision + 1);
    } catch (e) {
      if (request === playlistVersion.current) setToast(errorMessage(e));
    }
  }
  async function setFavorite(id: string, favorite: boolean) {
    const initial =
      libRef.current.tracks.find((track) => track.id === id)?.favorite ?? false;
    try {
      pendingFavorites.current++;
      await favorites.set(id, favorite, initial);
    } catch (e) {
      const message = errorMessage(e);
      setToast(t(message as TextKey) || message);
    } finally {
      if (--pendingFavorites.current === 0)
        setFavoriteRevision((revision) => revision + 1);
    }
  }
  async function savePlaylist(playlist: Partial<Playlist>, id?: string) {
    try {
      const saved = await api<Playlist>(
        `/playlists${id ? `/${id}` : ""}`,
        id ? "PUT" : "POST",
        playlist,
      );
      playlistVersion.current++;
      // Save completes independently of background membership calculation.
      reloadVersion.current++;
      startTransition(() =>
        setLib((current) => ({
          ...current,
          playlists: id
            ? current.playlists.map((item) => (item.id === id ? saved : item))
            : [...current.playlists, saved],
        })),
      );
      return true;
    } catch (e) {
      const message = errorMessage(e);
      setToast(t(message as TextKey) || message);
      return false;
    }
  }
  async function run(
    fn: () => Promise<unknown>,
    scope: "library" | "playlists" = "library",
  ) {
    try {
      await fn();
      setTimeout(
        () => void (scope === "playlists" ? reloadPlaylists() : reload()),
        0,
      );
      return true;
    } catch (e) {
      const message = errorMessage(e);
      setToast(t(message as TextKey) || message);
      return false;
    }
  }
  useEffect(() => {
    void reload();
    void player.syncRemote();
    const listener = () => void reload();
    const foreground = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = window.setInterval(foreground, 30000);
    window.addEventListener("harmonia:library", listener);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("harmonia:library", listener);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : prefs.theme;
      document.documentElement.lang = prefs.language === "zh" ? "zh-CN" : "en";
      document.documentElement.style.setProperty("--accent", prefs.accent);
      const root = document.documentElement;
      root.dataset.glass = prefs.glass ? "on" : "off";
      root.dataset.glassPopups =
        prefs.glass && prefs.glassPopups ? "on" : "off";
      root.style.setProperty(
        "--glass-blur",
        `${Math.max(0, Math.min(40, prefs.glassBlur))}px`,
      );
      root.style.setProperty(
        "--glass-opacity",
        `${Math.max(60, Math.min(100, prefs.glassOpacity))}%`,
      );
      root.style.setProperty(
        "--glass-popup-opacity",
        `${Math.max(75, Math.min(100, prefs.glassOpacity + 10))}%`,
      );
      for (const [key, value] of [
        ["--bg", prefs.background],
        ["--text", prefs.foreground],
      ]) {
        if (value) document.documentElement.style.setProperty(key, value);
        else document.documentElement.style.removeProperty(key);
      }
    };
    apply();
    media.addEventListener("change", apply);
    player.applyGain();
    return () => media.removeEventListener("change", apply);
  }, [prefs]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  return (
    <Ctx.Provider
      value={{
        lib,
        prefs,
        setPrefs,
        reload,
        reloadPlaylists,
        t,
        notice: setToast,
        error,
        busy,
        run,
        setFavorite,
        savePlaylist,
        ...playlistState,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status" onClick={() => setToast("")}>
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}
