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
import {
  api,
  defaults,
  type Library,
  load,
  type Playlist,
  type Preferences,
  save,
} from "./model";
import { cachedPage, fetchPage, invalidatePages } from "./page-cache";
import { player } from "./player";

interface Context {
  airplayAvailable: boolean;
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
  setFavorite: (
    id: string,
    favorite: boolean,
    initial?: boolean,
  ) => Promise<void>;
  savePlaylist: (playlist: Partial<Playlist>, id?: string) => Promise<boolean>;
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
  const [airplayAvailable, setAirplayAvailable] = useState(false);
  const reloadVersion = useRef(0);
  const libraryConnection = useRef("");
  const playlistVersion = useRef(0);
  const favoriteUpdates = useRef<FavoriteUpdates>();
  if (!favoriteUpdates.current) {
    favoriteUpdates.current = new FavoriteUpdates(
      (id, favorite) => api(`/tracks/${id}/favorite`, "PUT", { favorite }),
      (id, favorite) => {
        player.setFavorite(id, favorite);
      },
    );
  }

  const pendingFavorites = useRef(0);
  const favorites = favoriteUpdates.current;
  const t = (key: TextKey) => (prefs.language === "zh" ? zh : en)[key];
  const setPrefs = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...load("preferences", {}), ...patch };
    save("preferences", next);
    updatePrefs(next);
  };
  async function reload(throwOnError = false) {
    const request = ++reloadVersion.current;
    try {
      const connection = load("preferences", defaults);
      const key = JSON.stringify([connection.api, connection.token]);
      const changedConnection = libraryConnection.current !== key;
      if (changedConnection) setAirplayAvailable(false);
      if (changedConnection)
        setLib({
          playlists: [],
          sources: [],
          ruleSets: [],
          tagSeparators: "",
          cacheLimit: 0,
        });
      const cached = await cachedPage<Library>("/config");
      if (
        request === reloadVersion.current &&
        cached &&
        libraryConnection.current !== key
      ) {
        setLib({ ...cached, playlists: [] });
        setBusy(false);
      }
      const [data, capabilities] = await Promise.all([
        fetchPage<Library>("/config"),
        api<{ airplay: boolean }>("/capabilities").catch(() => ({ airplay: false })),
      ]);
      if (request !== reloadVersion.current) return;
      const latest = load("preferences", defaults);
      if (key !== JSON.stringify([latest.api, latest.token])) return;
      libraryConnection.current = key;
      setAirplayAvailable(capabilities.airplay === true);
      setLib((current) => ({
        ...data,
        playlists: changedConnection ? [] : current.playlists,
      }));
      setError("");
      invalidatePages();
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
      const path = `/playlists?type=${type}`;
      const cached = await cachedPage<{ playlists: Playlist[] }>(path);
      if (
        cached &&
        request === playlistVersion.current &&
        key ===
          JSON.stringify([
            load("preferences", defaults).api,
            load("preferences", defaults).token,
          ])
      ) {
        setLib((current) => ({
          ...current,
          playlists:
            type === "all"
              ? cached.playlists
              : [
                  ...current.playlists.filter((p) =>
                    type === "normal" ? p.smart : !p.smart,
                  ),
                  ...cached.playlists,
                ],
        }));
      }
      const { playlists } = await fetchPage<{ playlists: Playlist[] }>(path);
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
      invalidatePages();
    } catch (e) {
      if (request === playlistVersion.current) setToast(errorMessage(e));
    }
  }
  async function setFavorite(
    id: string,
    favorite: boolean,
    previous?: boolean,
  ) {
    const initial =
      previous ??
      player.snapshot().queue.find((track) => track.id === id)?.favorite ??
      false;
    try {
      pendingFavorites.current++;
      await favorites.set(id, favorite, initial);
    } catch (e) {
      const message = errorMessage(e);
      setToast(t(message as TextKey) || message);
    } finally {
      if (--pendingFavorites.current === 0) invalidatePages();
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
      // Saves invalidate page responses without downloading membership maps.
      reloadVersion.current++;
      startTransition(() =>
        setLib((current) => ({
          ...current,
          playlists: id
            ? current.playlists.map((item) => (item.id === id ? saved : item))
            : [...current.playlists, saved],
        })),
      );
      invalidatePages();
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
    let version = "";
    const foreground = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await fetchPage<{ version: string }>("/library/version");
        if (next.version !== version) {
          version = next.version;
          await reload();
        }
      } catch {}
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
        airplayAvailable,
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
