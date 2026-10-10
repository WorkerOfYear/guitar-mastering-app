import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Subdivision } from "@/shared/types";

export interface TrainerConfig {
  enabled: boolean;
  step: number; // bpm added…
  everyBars: number; // …every N bars
  target: number; // stop here
}

export interface MetronomeState {
  bpm: number;
  beats: number; // beats per bar
  subdivision: Subdivision;
  accent: boolean;
  volume: number;
  flash: boolean;
  trainer: TrainerConfig;
  running: boolean;
  /** Current beat (0-based) while running, −1 when stopped */
  beat: number;
  set: (patch: Partial<Omit<MetronomeState, "set">>) => void;
}

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const clampBpm = (bpm: number) => Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)));

export const useMetronome = create<MetronomeState>()(
  persist(
    (set) => ({
      bpm: 80,
      beats: 4,
      subdivision: 1,
      accent: true,
      volume: 0.8,
      flash: false,
      trainer: { enabled: false, step: 2, everyBars: 4, target: 140 },
      running: false,
      beat: -1,
      set: (patch) => set(patch),
    }),
    {
      name: "guitar:metronome",
      version: 1,
      partialize: ({ running: _r, beat: _b, set: _s, ...rest }) => rest,
    },
  ),
);
