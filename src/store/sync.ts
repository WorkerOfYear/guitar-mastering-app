import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";
import { flushFiles } from "@/lib/tabFiles";
import { signedIn, useAuth, type ServerFeatures } from "./auth";
import { exportData, useData, type DataState } from "./data";
import { mergeData, sameData } from "./merge";

// The library lives on the owner's server (/api/state); this device keeps a copy to work offline and merges with
// the server's whenever it can, so the phone, the computer and the Telegram Mini App see the same data.

interface SyncState {
  /** updatedAt of the server copy we last merged with */
  base: number | null;
  lastOk: number;
  error: string;
  busy: boolean;
}

export const useSync = create<SyncState>()(
  persist(() => ({ base: null, lastOk: 0, error: "", busy: false }) as SyncState, {
    name: "guitar:sync",
    partialize: ({ base, lastOk }) => ({ base, lastOk }),
  }),
);

const online = () => /^https?:$/.test(location.protocol);
export const syncEnabled = () => online() && signedIn();

let applying = false;
let running: Promise<void> | null = null;

async function syncOnce(attempt = 0): Promise<void> {
  const { doc } = await api<{ doc: { updatedAt: number; data: DataState } | null }>("/api/state");
  const local = exportData();
  const merged = mergeData(local, doc?.data);
  if (!sameData(merged, local)) {
    applying = true;
    useData.setState(merged);
    applying = false;
  }
  if (!doc || !sameData(merged, doc.data)) {
    const updatedAt = Date.now();
    try {
      await api("/api/state", { method: "PUT", body: JSON.stringify({ updatedAt, base: doc?.updatedAt ?? null, data: merged }) });
      useSync.setState({ base: updatedAt });
    } catch (e) {
      // Another device wrote in between: merge again with its version.
      if ((e as { status?: number }).status === 409 && attempt < 2) return syncOnce(attempt + 1);
      throw e;
    }
  } else useSync.setState({ base: doc.updatedAt });
}

export function syncNow() {
  if (!syncEnabled()) return Promise.resolve();
  if (running) return running;
  useSync.setState({ busy: true });
  running = syncOnce()
    // Files saved while offline (and, once per device, the ones from before the server) go up after the library.
    .then(() => flushFiles())
    .then(() => {
      useSync.setState({ lastOk: Date.now(), error: "" });
    })
    .catch((e: Error) => {
      useSync.setState({ error: e.message });
    })
    .finally(() => {
      running = null;
      useSync.setState({ busy: false });
    });
  return running;
}

/** Asks the server what it can do (audio from videos, MuseScore, the bot). */
export async function loadServerFeatures() {
  if (!syncEnabled()) return;
  try {
    useAuth.setState({ server: await api<ServerFeatures>("/api/me") });
  } catch {
    /* offline: keep what we knew */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Start syncing: now, a moment after local changes, whenever the app comes back to the foreground, and right after signing in. */
export function initSync() {
  void syncNow();
  void loadServerFeatures();
  useAuth.subscribe((s, prev) => {
    if (s.token && s.token !== prev.token) {
      void syncNow();
      void loadServerFeatures();
    }
  });
  useData.subscribe(() => {
    if (applying || !syncEnabled()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 2500);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
    else if (timer) {
      // Leaving the app: push pending changes right away.
      clearTimeout(timer);
      timer = null;
      void syncNow();
    }
  });
}
