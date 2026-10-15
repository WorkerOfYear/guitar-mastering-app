import type { Subdivision } from "@/shared/types";

// Rhythm patterns, as on metronom.us: a beat is cut into `grid` equal ticks and `play` lists the ticks
// (1-based) that sound — the rest are silent. Quarter/eighth beats share the same patterns.

export interface Rhythm {
  id: string;
  name: string;
  grid: 3 | 4 | 6;
  play: number[];
}

export const RHYTHMS: Rhythm[] = [
  { id: "q", name: "Одна на долю", grid: 4, play: [1] },
  { id: "e2", name: "Две восьмые", grid: 4, play: [1, 3] },
  { id: "re", name: "Пауза и восьмая", grid: 4, play: [3] },
  { id: "s4", name: "Четыре шестнадцатые", grid: 4, play: [1, 2, 3, 4] },
  { id: "rsrs", name: "Шестнадцатые через паузу", grid: 4, play: [2, 4] },
  { id: "ss8", name: "16 · 16 · 8", grid: 4, play: [1, 2, 3] },
  { id: "8ss", name: "8 · 16 · 16", grid: 4, play: [1, 3, 4] },
  { id: "s8s", name: "16 · 8 · 16", grid: 4, play: [1, 2, 4] },
  { id: "d8s", name: "Восьмая с точкой и 16", grid: 4, play: [1, 4] },
  { id: "sd8", name: "16 и восьмая с точкой", grid: 4, play: [1, 2] },
  { id: "t3", name: "Триоль", grid: 3, play: [1, 2, 3] },
  { id: "rt3", name: "Триоль: пауза в начале", grid: 3, play: [2, 3] },
  { id: "t3r", name: "Триоль: пауза в середине", grid: 3, play: [1, 3] },
  { id: "t3e", name: "Триоль: пауза в конце", grid: 3, play: [1, 2] },
  { id: "rtr", name: "Триоль: только середина", grid: 3, play: [2] },
  { id: "x6", name: "Секстоль", grid: 6, play: [1, 2, 3, 4, 5, 6] },
];

export const DEFAULT_RHYTHM = "q";

export const rhythmById = (id: string): Rhythm => RHYTHMS.find((r) => r.id === id) ?? RHYTHMS[0];

const BY_SUBDIVISION: Record<Subdivision, string> = { 1: "q", 2: "e2", 3: "t3", 4: "s4", 6: "x6" };
export const rhythmForSubdivision = (s: Subdivision) => BY_SUBDIVISION[s];

export interface TickPlan {
  /** 0-based beat in the bar */
  beat: number;
  /** 0-based tick inside the beat */
  tick: number;
  /** null — a rest */
  kind: "accent" | "beat" | "sub" | null;
}

/** What sounds at tick `pos` (0-based, counted from the start of the bar). */
export function planTick(rhythm: Rhythm, beats: number, accents: number[], pos: number): TickPlan {
  const perBar = beats * rhythm.grid;
  const p = ((pos % perBar) + perBar) % perBar;
  const beat = Math.floor(p / rhythm.grid);
  const tick = p % rhythm.grid;
  if (!rhythm.play.includes(tick + 1)) return { beat, tick, kind: null };
  if (tick > 0) return { beat, tick, kind: "sub" };
  return { beat, tick, kind: accents.includes(beat + 1) ? "accent" : "beat" };
}

// ---------- time signatures

export const SIGNATURE_PRESETS: [beats: number, unit: 4 | 8][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [3, 8],
  [6, 8],
  [7, 8],
  [9, 8],
  [12, 8],
];

export const BEATS_MIN = 1;
export const BEATS_MAX = 16;

/** Which beats are accented by default: the downbeat, or each group of three in compound meters (6/8, 9/8, 12/8). */
export function defaultAccents(beats: number, unit: number): number[] {
  if (unit === 8 && beats >= 6 && beats % 3 === 0) return Array.from({ length: beats / 3 }, (_, i) => i * 3 + 1);
  return [1];
}
