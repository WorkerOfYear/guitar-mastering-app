import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LabelMode = "note" | "degree" | "chord" | "finger" | "none";
/** How the tab player draws music: tablature, standard notation, or both */
export type TabView = "tab" | "score" | "both";
/** Light or dark; "auto" follows Telegram inside it, the system elsewhere */
export type ThemeMode = "auto" | "dark" | "light";

interface FretboardSettings {
  labelMode: LabelMode;
  leftHanded: boolean;
  frets: number;
  showOutside: boolean;
}

interface TheoryState {
  tab: "scale" | "chord";
  tonic: string;
  scaleId: string;
  chordType: string;
  /** Degree (1..7) of the diatonic chord highlighted over the scale; 0 = none */
  diatonic: number;
  /** Index of the fingering box; -1 = whole neck */
  position: number;
}

interface SettingsStore {
  fretboard: FretboardSettings;
  theory: TheoryState;
  tabView: TabView;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  setTabView: (view: TabView) => void;
  setFretboard: (patch: Partial<FretboardSettings>) => void;
  setTheory: (patch: Partial<TheoryState>) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      fretboard: { labelMode: "degree", leftHanded: false, frets: 15, showOutside: true },
      theory: { tab: "scale", tonic: "A", scaleId: "minor-pentatonic", chordType: "m7", diatonic: 0, position: 0 },
      tabView: "tab",
      theme: "auto",
      setTheme: (theme) => set({ theme }),
      setTabView: (tabView) => set({ tabView }),
      setFretboard: (patch) => set((s) => ({ fretboard: { ...s.fretboard, ...patch } })),
      setTheory: (patch) => set((s) => ({ theory: { ...s.theory, ...patch } })),
    }),
    { name: "guitar:settings", version: 1 },
  ),
);
