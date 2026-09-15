import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
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
  reload: () => Promise<void>;
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
  const setPrefs = (patch: Partial<Preferences>) =>
    updatePrefs((old) => {
      const next = { ...old, ...patch };
      save("preferences", next);
      return next;
    });
  async function reload() {
    try {
      const data = await api<Library>("/library");
      setLib(data);
      player.reconcile(data.tracks);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
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
      setToast(
        e instanceof Error ? t(e.message as TextKey) || e.message : t("error"),
      );
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
