import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { errorMessage } from "./errors";
import { en, type TextKey, zh } from "./i18n";
import {
  api,
  defaults,
  type Library,
  load,
  type Preferences,
  save,
} from "./model";
import { player } from "./player";

interface Context {
  lib: Library;
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  reload: (throwOnError?: boolean) => Promise<void>;
  t: (key: TextKey) => string;
  notice: (text: string) => void;
  error: string;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
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
  const t = (key: TextKey) => (prefs.language === "zh" ? zh : en)[key];
  const setPrefs = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...load("preferences", {}), ...patch };
    save("preferences", next);
    updatePrefs(next);
  };
  async function reload(throwOnError = false) {
    try {
      const data = await api<Library>("/library");
      setLib(data);
      player.reconcile(data.tracks);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
      if (throwOnError) throw e;
    } finally {
      setBusy(false);
    }
  }
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await reload();
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
    window.addEventListener("harmonia:library", listener);
    return () => window.removeEventListener("harmonia:library", listener);
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
        t,
        notice: setToast,
        error,
        busy,
        run,
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
