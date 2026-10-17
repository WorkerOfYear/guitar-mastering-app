import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tg } from "@/app/telegram";

// Who is using the app: a device signs in once with the password (the token is kept for a year);
// inside Telegram the bot's signed launch data is enough.

/** What the owner's server can do (GET /api/me). */
export interface ServerFeatures {
  audio: boolean;
  score: boolean;
  bot: boolean;
}

interface AuthState {
  token: string;
  server: ServerFeatures;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: "",
      server: { audio: false, score: false, bot: false },
      setToken: (token) => set({ token }),
      logout: () => set({ token: "" }),
    }),
    { name: "guitar:auth", partialize: ({ token, server }) => ({ token, server }) },
  ),
);

export const signedIn = (s: { token: string } = useAuth.getState()) => !!s.token || !!tg?.initData;
