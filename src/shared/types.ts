// Data model shared by the store, the session planner and (later) the sync API.

export type ItemType = "technique" | "song" | "lick" | "theory";
export type ItemStatus = "queue" | "active" | "rotation" | "archived";
export type Subdivision = 1 | 2 | 3 | 4 | 6;
export type Result = "clean" | "errors" | "fail";
export type BlockKind = "warmup" | "new" | "review" | "improv";

export interface Section {
  id: string;
  title: string;
  status: ItemStatus;
  targetBpm?: number | null;
  /** Bars of the Guitar Pro file this section covers, 1-based and inclusive */
  bars?: [number, number] | null;
}

export interface SyncPoint {
  bar: number;
  /** Which pass through a repeated bar (0 = first, omitted for 0) */
  occurrence?: number;
  ms: number;
}

/** Play-along video: a YouTube video, or an Instagram post/reel by its shortcode (instagram.com/reel/<id>). */
export type VideoLink =
  | {
      youtubeId: string;
      /** Start offset in seconds */
      start?: number;
      instagramId?: undefined;
    }
  | { instagramId: string; youtubeId?: undefined; start?: undefined };

/** Opens the Theory screen with these settings. */
export interface TheoryLink {
  tab: "scale" | "chord";
  tonic: string;
  scaleId?: string;
  chordType?: string;
  diatonic?: number;
}

/** Building blocks of an exercise or a piece, in the order they appear on its card (and open in a session). */
export type BlockId = "video" | "audio" | "score" | "board" | "metronome" | "notes" | "recorder";

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  description?: string;
  category?: string;
  status: ItemStatus;
  /** Part of the fixed warm-up; never planned into "new" or "review" */
  warmup?: boolean;
  /** Always included in review */
  pinned?: boolean;
  links: string[];
  startBpm?: number | null;
  targetBpm?: number | null;
  subdivision?: Subdivision;
  sections?: Section[];
  theory?: TheoryLink;
  /** Tab in alphaTex — played Songsterr-style with a cursor and sound */
  tab?: string;
  /** Play-along video (YouTube or Instagram) */
  video?: VideoLink;
  /** A Guitar Pro file is stored on this device for this item (IndexedDB) */
  tabFile?: { name: string; size: number };
  /** The recording the tab was written from (IndexedDB), played in sync with the notes */
  audioFile?: { name: string; size: number; /** Taken from the item's video */ fromVideo?: boolean };
  /** Where bars start in the recording: bar (1-based) → milliseconds. Sorted by bar. */
  audioSync?: SyncPoint[];
  /** Repeats (by closing bar) the recording plays only once — switched off when playing along with it */
  audioUnrepeat?: number[];
  /** Bars of the tab the recording doesn't play (a riff repeated once too often): they take no time with it */
  audioSkip?: number[];
  /** What the check found when the recording was bound to the tab: another tuning, another song, only a part… */
  audioWarnings?: string[];
  /** An exercise's blocks; when missing they follow from the fields that are filled in */
  blocks?: BlockId[];
  /** How long this item takes in a session; otherwise the block time is split evenly */
  minutes?: number;
  notes?: string;
  createdAt: number;
  /** Last edit; the newer copy wins when two devices sync */
  updatedAt?: number;
}

export interface TempoEntry {
  itemId: string;
  sectionId?: string;
  date: string; // YYYY-MM-DD, local
  at: number;
  bpm: number | null;
  result: Result;
  note?: string;
}

/** One practice unit in a plan: an item, or one section of a song. */
export interface PlanEntry {
  itemId: string;
  sectionId?: string;
}

/** A plan made by hand in the plan builder: what each block plays, in order. */
export interface PlanTemplate {
  warmup: PlanEntry[];
  new: PlanEntry[];
  review: PlanEntry[];
}
export type TemplateBlock = keyof PlanTemplate;

export interface ImprovTask {
  key: string;
  progressionId: string;
  challenge: string;
}

export interface PlanBlock {
  kind: BlockKind;
  minutes: number;
  entries: PlanEntry[];
  improv?: ImprovTask;
}

export interface BlockLog {
  kind: BlockKind;
  plannedSec: number;
  actualSec: number;
  entries: PlanEntry[];
  skipped?: boolean;
  improv?: ImprovTask;
}

export interface SessionLog {
  id: string;
  date: string;
  startedAt: number;
  endedAt: number;
  blocks: BlockLog[];
  notes?: string;
}

export const BLOCK_META: Record<BlockKind, { icon: string; title: string; hint: string }> = {
  warmup: { icon: "🔥", title: "Разминка", hint: "Фиксированный набор упражнений" },
  new: { icon: "🧩", title: "Разбор нового", hint: "Техника, кусок песни, лик или теория" },
  review: { icon: "🔁", title: "Повторение", hint: "То, что дольше всего не играл" },
  improv: { icon: "🎶", title: "Импровизация", hint: "Тональность, ступени и лады под них" },
};

export const TYPE_META: Record<ItemType, { icon: string; title: string }> = {
  technique: { icon: "⚡", title: "Техника" },
  song: { icon: "🎵", title: "Произведение" },
  lick: { icon: "〰️", title: "Лик" },
  theory: { icon: "🎼", title: "Теория" },
};

export const STATUS_META: Record<ItemStatus, { title: string }> = {
  active: { title: "В работе" },
  queue: { title: "Очередь" },
  rotation: { title: "Ротация" },
  archived: { title: "Архив" },
};

export const SUBDIVISION_META: Record<Subdivision, string> = {
  1: "четверти",
  2: "восьмые",
  3: "триоли",
  4: "шестнадцатые",
  6: "секстоли",
};
