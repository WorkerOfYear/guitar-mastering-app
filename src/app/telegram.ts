// Telegram Mini App integration: theme, full height, native back button, haptics.
// Everything is a no-op in a normal browser.

interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent(event: string, cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: "light" | "medium" | "heavy"): void; selectionChanged(): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const app = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
/** Telegram injects the object everywhere; it only has launch data inside the Mini App. */
export const tg = app && app.initData ? app : undefined;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.(); // horizontal fretboard scrolling shouldn't close the app
  // Light or dark follows Telegram; the colors are the app's own, and Telegram's header takes the app's background.
  const apply = () => {
    const root = document.documentElement;
    root.dataset.theme = tg.colorScheme;
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (bg) {
      tg.setHeaderColor?.(bg);
      tg.setBackgroundColor?.(bg);
    }
  };
  apply();
  tg.onEvent("themeChanged", apply);
}

export const haptic = () => tg?.HapticFeedback?.selectionChanged();
