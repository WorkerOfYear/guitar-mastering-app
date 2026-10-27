import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STARTER_LIBRARY } from "@/data/library";
import { entryKey } from "@/lib/progress";
import { withPlans } from "./plans";
import type { BlockKind, Item, ItemStatus, PlanEntry, PlanTemplate, SavedPlan, Section, SessionLog, TempoEntry } from "@/shared/types";

export interface PracticeSettings {
  blocks: Record<BlockKind, number>; // minutes
  days: number[]; // 0 = Sunday
  maxNew: number;
  minutesPerReview: number;
}

export const DEFAULT_PRACTICE: PracticeSettings = {
  blocks: { warmup: 15, new: 20, review: 10, improv: 15 },
  days: [1, 3, 6],
  maxNew: 2,
  minutesPerReview: 5,
};

export interface DataState {
  items: Item[];
  log: TempoEntry[];
  sessions: SessionLog[];
  /** entryKey → last day it was played */
  lastPlayed: Record<string, string>;
  recentKeys: string[];
  practice: PracticeSettings;
  practiceUpdatedAt?: number;
  /** Deleted item ids → when, so a sync doesn't bring them back */
  deleted?: Record<string, number>;
  /** Hand-made plans; the chosen one (with any entries) is played instead of the automatic planner */
  plans?: SavedPlan[];
  /** The plan "Сегодня" plays; none means the automatic one */
  planId?: string | null;
  /** When plans or the choice last changed (named after the single plan there used to be) */
  templateUpdatedAt?: number;
  /** The single plan of older versions and backups; turned into `plans` by withPlans */
  template?: PlanTemplate;
}

interface DataActions {
  addItem: (item: Omit<Item, "id" | "createdAt">) => string;
  updateItem: (id: string, patch: Partial<Item>) => void;
  removeItem: (id: string) => void;
  setStatus: (id: string, status: ItemStatus) => void;
  updateSection: (itemId: string, sectionId: string, patch: Partial<Section>) => void;
  addSection: (itemId: string, title: string) => void;
  removeSection: (itemId: string, sectionId: string) => void;
  logTempo: (entry: Omit<TempoEntry, "at">) => void;
  markPlayed: (entries: PlanEntry[], date: string) => void;
  addSession: (session: SessionLog) => void;
  pushRecentKey: (key: string) => void;
  setPractice: (patch: Partial<PracticeSettings>) => void;
  /** Adds an empty plan and returns its id. */
  addPlan: (name: string) => string;
  updatePlan: (id: string, patch: Partial<Omit<SavedPlan, "id">>) => void;
  removePlan: (id: string) => void;
  choosePlan: (id: string | null) => void;
  replaceAll: (data: DataState) => void;
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const initial = (): DataState => ({
  // The library starts empty: everything in it is added by the user.
  items: [],
  log: [],
  sessions: [],
  lastPlayed: {},
  recentKeys: [],
  practice: DEFAULT_PRACTICE,
  deleted: {},
});

const mapItem = (items: Item[], id: string, fn: (i: Item) => Item) => items.map((i) => (i.id === id ? { ...fn(i), updatedAt: Date.now() } : i));

export const useData = create<DataState & DataActions>()(
  persist(
    (set) => ({
      ...initial(),
      addItem: (item) => {
        const id = uid(item.type);
        set((s) => ({ items: [...s.items, { ...item, id, createdAt: Date.now(), updatedAt: Date.now() }] }));
        return id;
      },
      updateItem: (id, patch) => set((s) => ({ items: mapItem(s.items, id, (i) => ({ ...i, ...patch })) })),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id), deleted: { ...s.deleted, [id]: Date.now() } })),
      setStatus: (id, status) => set((s) => ({ items: mapItem(s.items, id, (i) => ({ ...i, status })) })),
      updateSection: (itemId, sectionId, patch) =>
        set((s) => ({
          items: mapItem(s.items, itemId, (i) => ({
            ...i,
            sections: (i.sections ?? []).map((sec) => (sec.id === sectionId ? { ...sec, ...patch } : sec)),
          })),
        })),
      addSection: (itemId, title) =>
        set((s) => ({
          items: mapItem(s.items, itemId, (i) => ({ ...i, sections: [...(i.sections ?? []), { id: uid("sec"), title, status: "queue" }] })),
        })),
      removeSection: (itemId, sectionId) =>
        set((s) => ({ items: mapItem(s.items, itemId, (i) => ({ ...i, sections: (i.sections ?? []).filter((x) => x.id !== sectionId) })) })),
      logTempo: (entry) => set((s) => ({ log: [...s.log, { ...entry, at: Date.now() }] })),
      markPlayed: (entries, date) =>
        set((s) => {
          const lastPlayed = { ...s.lastPlayed };
          for (const e of entries) {
            lastPlayed[entryKey(e)] = date;
            lastPlayed[e.itemId] = date;
          }
          return { lastPlayed };
        }),
      addSession: (session) => set((s) => ({ sessions: [...s.sessions.filter((x) => x.id !== session.id), session] })),
      pushRecentKey: (key) => set((s) => ({ recentKeys: [...s.recentKeys, key].slice(-6) })),
      setPractice: (patch) => set((s) => ({ practice: { ...s.practice, ...patch }, practiceUpdatedAt: Date.now() })),
      addPlan: (name) => {
        const id = uid("plan");
        set((s) => ({ plans: [...(s.plans ?? []), { id, name, warmup: [], new: [], review: [] }], templateUpdatedAt: Date.now() }));
        return id;
      },
      updatePlan: (id, patch) =>
        set((s) => ({ plans: (s.plans ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)), templateUpdatedAt: Date.now() })),
      removePlan: (id) =>
        set((s) => ({ plans: (s.plans ?? []).filter((p) => p.id !== id), planId: s.planId === id ? null : s.planId, templateUpdatedAt: Date.now() })),
      choosePlan: (id) => set(() => ({ planId: id, templateUpdatedAt: Date.now() })),
      replaceAll: (data) => set(() => ({ ...initial(), template: undefined, ...withPlans(data) })),
    }),
    {
      name: "guitar:data",
      version: 4,
      migrate: (persisted, version) => {
        let state = persisted as DataState;
        if (version < 3) Object.assign(state, dropStarter(state.items ?? [], state.deleted ?? {}));
        if (version < 4) state = withPlans(state);
        return state;
      },
    },
  ),
);

/**
 * Removes the old built-in starter items, edited or not, and marks them deleted so a sync with
 * another device or the server doesn't bring them back. The user's own items stay.
 */
export function dropStarter(items: Item[], deleted: Record<string, number>, now = Date.now()) {
  const starter = new Set(STARTER_LIBRARY.map((i) => i.id));
  const gone = { ...deleted };
  for (const id of starter) gone[id] = Math.max(now, gone[id] ?? 0);
  return { items: items.filter((i) => !starter.has(i.id)), deleted: gone };
}

/** Plain data for backups and (later) sync. */
export const exportData = (): DataState => {
  const { items, log, sessions, lastPlayed, recentKeys, practice, practiceUpdatedAt, deleted, plans, planId, templateUpdatedAt } = useData.getState();
  return { items, log, sessions, lastPlayed, recentKeys, practice, practiceUpdatedAt, deleted, plans, planId, templateUpdatedAt };
};
