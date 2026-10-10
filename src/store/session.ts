import { create } from "zustand";
import { persist } from "zustand/middleware";
import { localDate } from "@/lib/date";
import type { ImprovTask, PlanBlock, SessionLog } from "@/shared/types";

export interface ActiveSession {
  id: string;
  date: string;
  startedAt: number;
  blocks: PlanBlock[];
  block: number;
  entry: number;
  /** Seconds already spent per block (excluding the currently running stretch) */
  elapsed: number[];
  extraMinutes: number[];
  /** Timestamp the current block's clock was (re)started; null while paused */
  runningSince: number | null;
  skipped: boolean[];
}

interface SessionStore {
  active: ActiveSession | null;
  /** The last finished session, shown on the summary screen */
  finished: SessionLog | null;
  start: (blocks: PlanBlock[]) => void;
  pause: () => void;
  resume: () => void;
  setEntry: (entry: number) => void;
  goToBlock: (block: number, opts?: { skipCurrent?: boolean }) => void;
  extend: (minutes: number) => void;
  setImprov: (task: ImprovTask) => void;
  finish: () => SessionLog | null;
  cancel: () => void;
  clearFinished: () => void;
}

const now = () => Date.now();

/** Commit the running stretch of the current block into `elapsed`. */
function settle(s: ActiveSession, at = now()): ActiveSession {
  if (s.runningSince === null) return s;
  const elapsed = [...s.elapsed];
  elapsed[s.block] += Math.max(0, (at - s.runningSince) / 1000);
  return { ...s, elapsed, runningSince: at };
}

export const blockSeconds = (s: ActiveSession, block: number, at = now()) =>
  s.elapsed[block] + (block === s.block && s.runningSince !== null ? Math.max(0, (at - s.runningSince) / 1000) : 0);

export const plannedSeconds = (s: ActiveSession, block: number) => (s.blocks[block].minutes + s.extraMinutes[block]) * 60;

export const useSession = create<SessionStore>()(
  persist(
    (set, get) => ({
      active: null,
      finished: null,
      start: (blocks) =>
        set({
          finished: null,
          active: {
            id: `s-${now().toString(36)}`,
            date: localDate(),
            startedAt: now(),
            blocks,
            block: 0,
            entry: 0,
            elapsed: blocks.map(() => 0),
            extraMinutes: blocks.map(() => 0),
            runningSince: now(),
            skipped: blocks.map(() => false),
          },
        }),
      pause: () => set((st) => (st.active ? { active: { ...settle(st.active), runningSince: null } } : st)),
      resume: () => set((st) => (st.active && st.active.runningSince === null ? { active: { ...st.active, runningSince: now() } } : st)),
      setEntry: (entry) => set((st) => (st.active ? { active: { ...st.active, entry } } : st)),
      goToBlock: (block, opts) =>
        set((st) => {
          if (!st.active) return st;
          const s = settle(st.active);
          const skipped = [...s.skipped];
          if (opts?.skipCurrent) skipped[s.block] = true;
          return { active: { ...s, block, entry: 0, skipped, runningSince: s.runningSince === null ? null : now() } };
        }),
      extend: (minutes) =>
        set((st) => {
          if (!st.active) return st;
          const extraMinutes = [...st.active.extraMinutes];
          extraMinutes[st.active.block] += minutes;
          return { active: { ...st.active, extraMinutes } };
        }),
      setImprov: (task) =>
        set((st) => {
          if (!st.active) return st;
          return { active: { ...st.active, blocks: st.active.blocks.map((b) => (b.kind === "improv" ? { ...b, improv: task } : b)) } };
        }),
      finish: () => {
        const a = get().active;
        if (!a) return null;
        const s = settle(a);
        const log: SessionLog = {
          id: s.id,
          date: s.date,
          startedAt: s.startedAt,
          endedAt: now(),
          blocks: s.blocks.map((b, i) => ({
            kind: b.kind,
            plannedSec: plannedSeconds(s, i),
            actualSec: Math.round(s.elapsed[i]),
            entries: b.entries,
            skipped: s.skipped[i] || s.elapsed[i] < 5 || undefined,
            improv: b.improv,
          })),
        };
        set({ active: null, finished: log });
        return log;
      },
      cancel: () => set({ active: null }),
      clearFinished: () => set({ finished: null }),
    }),
    { name: "guitar:session", version: 1 },
  ),
);
