import { chroma, mod12, noteName, parseInterval, parseNote, transpose, type Interval } from "./notes";

export interface ScaleDef {
  id: string;
  name: string;
  group: string;
  intervals: string[];
  /** Positions are drawn from this scale's patterns, the remaining notes are added inside each box (blues). */
  patternBase?: string;
}

export const SCALES: ScaleDef[] = [
  { id: "minor-pentatonic", name: "Минорная пентатоника", group: "Пентатоника", intervals: ["1", "b3", "4", "5", "b7"] },
  { id: "major-pentatonic", name: "Мажорная пентатоника", group: "Пентатоника", intervals: ["1", "2", "3", "5", "6"] },
  { id: "blues", name: "Блюзовая", group: "Пентатоника", intervals: ["1", "b3", "4", "b5", "5", "b7"], patternBase: "minor-pentatonic" },
  { id: "ionian", name: "Ионийский (мажор)", group: "Лады мажора", intervals: ["1", "2", "3", "4", "5", "6", "7"] },
  { id: "dorian", name: "Дорийский", group: "Лады мажора", intervals: ["1", "2", "b3", "4", "5", "6", "b7"] },
  { id: "phrygian", name: "Фригийский", group: "Лады мажора", intervals: ["1", "b2", "b3", "4", "5", "b6", "b7"] },
  { id: "lydian", name: "Лидийский", group: "Лады мажора", intervals: ["1", "2", "3", "#4", "5", "6", "7"] },
  { id: "mixolydian", name: "Миксолидийский", group: "Лады мажора", intervals: ["1", "2", "3", "4", "5", "6", "b7"] },
  { id: "aeolian", name: "Эолийский (минор)", group: "Лады мажора", intervals: ["1", "2", "b3", "4", "5", "b6", "b7"] },
  { id: "locrian", name: "Локрийский", group: "Лады мажора", intervals: ["1", "b2", "b3", "4", "b5", "b6", "b7"] },
  { id: "harmonic-minor", name: "Гармонический минор", group: "Другие", intervals: ["1", "2", "b3", "4", "5", "b6", "7"] },
  { id: "melodic-minor", name: "Мелодический минор", group: "Другие", intervals: ["1", "2", "b3", "4", "5", "6", "7"] },
  { id: "phrygian-dominant", name: "Фригийский доминантовый", group: "Другие", intervals: ["1", "b2", "3", "4", "5", "b6", "b7"] },
  { id: "altered", name: "Альтерированный", group: "Другие", intervals: ["1", "b2", "#2", "3", "#4", "b6", "b7"] },
];

export const scaleById = (id: string) => SCALES.find((s) => s.id === id) ?? SCALES[0];

/** One note of a scale or chord, spelled relative to its root. */
export interface Tone {
  chroma: number;
  name: string;
  interval: Interval;
}

export function spell(tonic: string, intervals: string[]): Tone[] {
  const root = parseNote(tonic);
  return intervals.map((text) => {
    const interval = parseInterval(text);
    const pc = transpose(root, interval);
    return { chroma: chroma(pc), name: noteName(pc), interval };
  });
}

export const scaleTones = (tonic: string, scaleId: string) => spell(tonic, scaleById(scaleId).intervals);

// ---------- diatonic seventh chords (for 7-note scales with one note per letter)

const QUALITIES: Record<string, { suffix: string; minor: boolean }> = {
  "4,7,11": { suffix: "maj7", minor: false },
  "3,7,10": { suffix: "m7", minor: true },
  "4,7,10": { suffix: "7", minor: false },
  "3,6,10": { suffix: "m7♭5", minor: true },
  "3,6,9": { suffix: "dim7", minor: true },
  "3,7,11": { suffix: "m(maj7)", minor: true },
  "4,8,11": { suffix: "maj7♯5", minor: false },
  "4,8,10": { suffix: "7♯5", minor: false },
  "4,6,10": { suffix: "7♭5", minor: false },
};

/** Chord type id (see chords.ts) for a diatonic quality, when the app knows it. */
const QUALITY_TYPE: Record<string, string> = { maj7: "maj7", m7: "m7", "7": "7", "m7♭5": "m7b5", dim7: "dim7", "m(maj7)": "mMaj7" };

// Lower-case numerals already say "minor", so the "m" is dropped from the suffix.
const ROMAN_SUFFIX: Record<string, string> = { m7: "7", "m7♭5": "ø7", dim7: "°7", "m(maj7)": "(maj7)" };

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export interface DiatonicChord {
  degree: number; // 1..7
  roman: string; // "ii7", "♭VImaj7"
  symbol: string; // "Dm7"
  rootName: string;
  typeId?: string;
  tones: Tone[]; // root, 3rd, 5th, 7th
}

export function diatonicChords(tonic: string, scaleId: string): DiatonicChord[] {
  const tones = scaleTones(tonic, scaleId);
  const degrees = tones.map((t) => (t.interval.degree - 1) % 7);
  if (tones.length !== 7 || new Set(degrees).size !== 7) return [];
  return tones.map((root, i) => {
    const chordTones = [0, 2, 4, 6].map((k) => tones[(i + k) % 7]);
    const key = chordTones.slice(1).map((t) => mod12(t.chroma - root.chroma)).join(",");
    const q = QUALITIES[key] ?? { suffix: "?", minor: false };
    const acc = root.interval.label.replace(/\d+/, "");
    const numeral = q.minor ? ROMAN[i].toLowerCase() : ROMAN[i];
    const romanSuffix = ROMAN_SUFFIX[q.suffix] ?? q.suffix;
    return {
      degree: i + 1,
      roman: acc + numeral + romanSuffix,
      symbol: root.name + q.suffix,
      rootName: root.name,
      typeId: QUALITY_TYPE[q.suffix],
      tones: chordTones,
    };
  });
}
