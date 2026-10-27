import { create } from "zustand";
import { persist } from "zustand/middleware";
import { localDate } from "@/lib/date";
import { entryKey } from "@/lib/progress";
import type { BlockKind, Item, PlanEntry, SessionLog } from "@/shared/types";

/** Free practice: no plan and no goal, the clock just counts up while you play whatever you pick. */
export interface FreeSession {
  id: string;
  date: string;
  startedAt: number;
  entry: PlanEntry | null;
  /** Seconds per played unit (entryKey), excluding the currently running stretch */
  played: Record<string, number>;
  /** Units in the order they were first picked */
  entries: PlanEntry[];
  /** Timestamp the clock was (re)started; null while paused */
  runningSince: number | null;
}

interface FreeStore {
  active: FreeSession | null;
  start: () => void;
  pick: (entry: PlanEntry) => void;
  pause: () => void;
  resume: () => void;
  /** Ends the session; the log is null when nothing was played. */
  finish: (items: Item[]) => SessionLog | null;
  cancel: () => void;
}

const now = () => Date.now();

/** Commit the running stretch into the current unit's seconds. */
function settle(s: FreeSession, at = now()): FreeSession {
  if (s.runningSince === null || !s.entry) return s;
  const key = entryKey(s.entry);
  return { ...s, played: { ...s.played, [key]: (s.played[key] ?? 0) + Math.max(0, (at - s.runningSince) / 1000) }, runningSince: at };
}

export const unitSeconds = (s: FreeSession, e: PlanEntry, at = now()) =>
  (s.played[entryKey(e)] ?? 0) + (s.entry && entryKey(s.entry) === entryKey(e) && s.runningSince !== null ? Math.max(0, (at - s.runningSince) / 1000) : 0);

export const totalSeconds = (s: FreeSession, at = now()) =>
  Object.values(s.played).reduce((sum, v) => sum + v, 0) + (s.entry && s.runningSince !== null ? Math.max(0, (at - s.runningSince) / 1000) : 0);

/** Learning what is in progress counts as "new", the rest as review — so the progress stats keep adding up. */
const kindOf = (item?: Item): BlockKind => (item?.status === "active" ? "new" : "review");

export const useFree = create<FreeStore>()(
  persist(
    (set, get) => ({
      active: null,
      start: () =>
        set((st) =>
          st.active ? st : { active: { id: `f-${now().toString(36)}`, date: localDate(), startedAt: now(), entry: null, played: {}, entries: [], runningSince: null } },
        ),
      pick: (entry) =>
        set((st) => {
          if (!st.active) return st;
          const s = settle(st.active);
          const known = s.entries.some((e) => entryKey(e) === entryKey(entry));
          // Picking something starts the clock: you picked it to play it.
          return { active: { ...s, entry, entries: known ? s.entries : [...s.entries, entry], runningSince: now() } };
        }),
      pause: () => set((st) => (st.active ? { active: { ...settle(st.active), runningSince: null } } : st)),
      resume: () => set((st) => (st.active?.entry && st.active.runningSince === null ? { active: { ...st.active, runningSince: now() } } : st)),
      finish: (items) => {
        const a = get().active;
        if (!a) return null;
        const s = settle(a);
        set({ active: null });
        const blocks = s.entries
          .map((e) => ({ e, sec: Math.round(s.played[entryKey(e)] ?? 0) }))
          .filter(({ sec }) => sec >= 5)
          .map(({ e, sec }) => ({ kind: kindOf(items.find((i) => i.id === e.itemId)), plannedSec: sec, actualSec: sec, entries: [e] }));
        return blocks.length ? { id: s.id, date: s.date, startedAt: s.startedAt, endedAt: now(), blocks } : null;
      },
      cancel: () => set({ active: null }),
    }),
    { name: "guitar:free", version: 1 },
  ),
);
