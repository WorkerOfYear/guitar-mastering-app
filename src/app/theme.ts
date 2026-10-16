import { useSettings, type ThemeMode } from "@/store/settings";
import { tg } from "./telegram";

// Light or dark: the user's choice in settings, or "auto" — Telegram's scheme inside it, the system's elsewhere.
// The colors themselves are the app's own (index.css); Telegram's header and the browser bar take its background.

const systemLight = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: light)") : undefined;

export const resolveTheme = (mode: ThemeMode, telegram?: "light" | "dark", systemIsLight = false): "light" | "dark" =>
  mode !== "auto" ? mode : (telegram ?? (systemIsLight ? "light" : "dark"));

function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(useSettings.getState().theme, tg?.colorScheme, !!systemLight?.matches);
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (!bg) return;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  tg?.setHeaderColor?.(bg);
  tg?.setBackgroundColor?.(bg);
}

export function initTheme() {
  apply();
  useSettings.subscribe((s, prev) => s.theme !== prev.theme && apply());
  tg?.onEvent("themeChanged", apply);
  systemLight?.addEventListener?.("change", apply);
}
