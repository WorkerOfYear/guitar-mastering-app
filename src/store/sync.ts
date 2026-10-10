import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tg } from "@/app/telegram";
import { exportData, useData, type DataState } from "./data";
import { mergeData, sameData } from "./merge";

// Keeps the phone browser, the computer and the Telegram Mini App on the same data through /api/state.
// Inside Telegram the signed launch data replaces the sync key. Works only on the deployed site.

interface SyncState {
  key: string;
  /** updatedAt of the server copy we last merged with */
  base: number | null;
  lastOk: number;
  error: string;
  busy: boolean;
  setKey: (key: string) => void;
}

export const useSync = create<SyncState>()(
  persist(
    (set) => ({ key: "", base: null, lastOk: 0, error: "", busy: false, setKey: (key) => set({ key, base: null, error: "" }) }),
    { name: "guitar:sync", partialize: ({ key, base, lastOk }) => ({ key, base, lastOk }) },
  ),
);

const online = () => /^https?:$/.test(location.protocol);
export const syncEnabled = () => online() && (!!useSync.getState().key || !!tg?.initData);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = useSync.getState().key;
  const r = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-sync-key": key } : { "x-telegram-init-data": tg?.initData ?? "" }),
      ...(init.headers ?? {}),
    },
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(data.error || `Ошибка сервера (${r.status})`), { status: r.status });
  return data;
}

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

let timer: ReturnType<typeof setTimeout> | null = null;

/** Start syncing: now, a moment after local changes, and whenever the app comes back to the foreground. */
export function initSync() {
  void syncNow();
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
