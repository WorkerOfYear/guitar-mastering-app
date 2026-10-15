import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_RHYTHM, rhythmForSubdivision } from "@/audio/rhythms";
import { DEFAULT_CLICK } from "@/audio/clicks";
import type { Subdivision } from "@/shared/types";

export interface TrainerConfig {
  enabled: boolean;
  step: number; // bpm added…
  everyBars: number; // …every N bars
  target: number; // stop here
}

export interface MetronomeState {
  bpm: number;
  /** Beats per bar (numerator of the time signature) */
  beats: number;
  /** Denominator of the time signature: 4 or 8 */
  beatUnit: 4 | 8;
  /** Accented beats, 1-based */
  accents: number[];
  /** Pattern id inside a beat, see audio/rhythms */
  rhythm: string;
  /** Click sound id, see audio/clicks */
  click: string;
  volume: number;
  flash: boolean;
  trainer: TrainerConfig;
  running: boolean;
  /** Current beat (0-based) while running, −1 when stopped */
  beat: number;
  set: (patch: Partial<Omit<MetronomeState, "set">>) => void;
}

export const BPM_MIN = 20;
export const BPM_MAX = 300;
export const clampBpm = (bpm: number) => Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)));

export const useMetronome = create<MetronomeState>()(
  persist(
    (set) => ({
      bpm: 80,
      beats: 4,
      beatUnit: 4,
      accents: [1],
      rhythm: DEFAULT_RHYTHM,
      click: DEFAULT_CLICK,
      volume: 0.8,
      flash: false,
      trainer: { enabled: false, step: 2, everyBars: 4, target: 140 },
      running: false,
      beat: -1,
      set: (patch) => set(patch),
    }),
    {
      name: "guitar:metronome",
      version: 2,
      partialize: ({ running: _r, beat: _b, set: _s, ...rest }) => rest,
      // v1 had `accent` (downbeat on/off) and `subdivision` instead of per-beat accents and patterns.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const { accent, subdivision, ...rest } = s;
          return {
            ...rest,
            accents: accent === false ? [] : [1],
            rhythm: rhythmForSubdivision((subdivision as Subdivision) ?? 1) ?? DEFAULT_RHYTHM,
          } as unknown as MetronomeState;
        }
        return s as unknown as MetronomeState;
      },
    },
  ),
);
