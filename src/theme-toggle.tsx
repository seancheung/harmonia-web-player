import { Moon, Sun, SunMoon } from "lucide-react";
import { useApp } from "./context";

export function ThemeToggle() {
  const { prefs, setPrefs, t } = useApp();
  const next =
    prefs.theme === "light"
      ? "dark"
      : prefs.theme === "dark"
        ? "system"
        : "light";
  const Icon =
    prefs.theme === "light" ? Sun : prefs.theme === "dark" ? Moon : SunMoon;
  const label = `${t("theme")}: ${t(prefs.theme)} · ${t("switchToTheme")} ${t(next)}`;
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      title={label}
      aria-label={label}
      onClick={() => setPrefs({ theme: next })}
    >
      <Icon size={19} aria-hidden="true" />
    </button>
  );
}
