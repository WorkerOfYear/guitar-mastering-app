import { mod12, parseNote, chroma } from "./notes";
import { spell, type Tone } from "./scales";

export interface ChordType {
  id: string;
  symbol: string; // suffix shown after the root: "maj7", "m7♭5"
  name: string;
  intervals: string[];
}

export const CHORD_TYPES: ChordType[] = [
  { id: "maj", symbol: "", name: "Мажорное трезвучие", intervals: ["1", "3", "5"] },
  { id: "m", symbol: "m", name: "Минорное трезвучие", intervals: ["1", "b3", "5"] },
  { id: "maj7", symbol: "maj7", name: "Большой мажорный септаккорд", intervals: ["1", "3", "5", "7"] },
  { id: "m7", symbol: "m7", name: "Минорный септаккорд", intervals: ["1", "b3", "5", "b7"] },
  { id: "7", symbol: "7", name: "Доминантсептаккорд", intervals: ["1", "3", "5", "b7"] },
  { id: "m7b5", symbol: "m7♭5", name: "Полууменьшённый", intervals: ["1", "b3", "b5", "b7"] },
  { id: "dim7", symbol: "dim7", name: "Уменьшённый септаккорд", intervals: ["1", "b3", "b5", "bb7"] },
  { id: "mMaj7", symbol: "m(maj7)", name: "Минорный с большой септимой", intervals: ["1", "b3", "5", "7"] },
  { id: "6", symbol: "6", name: "Мажорный секстаккорд", intervals: ["1", "3", "5", "6"] },
  { id: "m6", symbol: "m6", name: "Минорный секстаккорд", intervals: ["1", "b3", "5", "6"] },
  { id: "maj9", symbol: "maj9", name: "Мажорный нонаккорд", intervals: ["1", "3", "5", "7", "9"] },
  { id: "m9", symbol: "m9", name: "Минорный нонаккорд", intervals: ["1", "b3", "5", "b7", "9"] },
  { id: "9", symbol: "9", name: "Доминантовый нонаккорд", intervals: ["1", "3", "5", "b7", "9"] },
  { id: "13", symbol: "13", name: "Доминантовый 13", intervals: ["1", "3", "5", "b7", "9", "13"] },
];

export const chordTypeById = (id: string) => CHORD_TYPES.find((c) => c.id === id) ?? CHORD_TYPES[2];

export const chordTones = (root: string, typeId: string): Tone[] => spell(root, chordTypeById(typeId).intervals);

/** 3rd and 7th — the notes that define a chord's quality and lead voices to the next chord. */
export const isGuideTone = (t: Tone) => {
  const simple = ((t.interval.degree - 1) % 7) + 1;
  return simple === 3 || simple === 7;
};

// ---------- voicings

/** A chord shape: fret offsets from the root fret, low E → high e; null = muted string. */
interface Shape {
  group: string;
  rootString: number; // 0 = low E
  offsets: (number | null)[];
}

const n = null;
// Offsets are relative to the root's fret on `rootString`.
const SHAPES: Record<string, Shape[]> = {
  maj7: [
    { group: "Shell, тоника на 6-й", rootString: 0, offsets: [0, n, 1, 1, n, n] },
    { group: "Shell, тоника на 5-й", rootString: 1, offsets: [n, 0, n, 1, 2, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 2, 1, 2, n] },
    { group: "Drop 2, струны 4–1", rootString: 2, offsets: [n, n, 0, 2, 2, 2] },
    { group: "Drop 3, тоника на 6-й", rootString: 0, offsets: [0, n, 1, 1, 0, n] },
  ],
  m7: [
    { group: "Shell, тоника на 6-й", rootString: 0, offsets: [0, n, 0, 0, n, n] },
    { group: "Shell, тоника на 5-й", rootString: 1, offsets: [n, 0, n, 0, 1, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 2, 0, 1, n] },
    { group: "Drop 2, струны 4–1", rootString: 2, offsets: [n, n, 0, 2, 1, 1] },
    { group: "Drop 3, тоника на 6-й", rootString: 0, offsets: [0, n, 0, 0, 0, n] },
  ],
  "7": [
    { group: "Shell, тоника на 6-й", rootString: 0, offsets: [0, n, 0, 1, n, n] },
    { group: "Shell, тоника на 5-й", rootString: 1, offsets: [n, 0, n, 0, 2, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 2, 0, 2, n] },
    { group: "Drop 2, струны 4–1", rootString: 2, offsets: [n, n, 0, 2, 1, 2] },
    { group: "Drop 3, тоника на 6-й", rootString: 0, offsets: [0, n, 0, 1, 0, n] },
  ],
  m7b5: [
    { group: "Тоника на 6-й", rootString: 0, offsets: [0, n, 0, 0, -1, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 1, 0, 1, n] },
    { group: "Drop 2, струны 4–1", rootString: 2, offsets: [n, n, 0, 1, 1, 1] },
  ],
  dim7: [
    { group: "Тоника на 6-й", rootString: 0, offsets: [0, n, -1, 0, -1, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 1, -1, 1, n] },
    { group: "Drop 2, струны 4–1", rootString: 2, offsets: [n, n, 0, 1, 0, 1] },
  ],
  mMaj7: [
    { group: "Shell, тоника на 6-й", rootString: 0, offsets: [0, n, 1, 0, n, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 2, 1, 1, n] },
  ],
  "6": [
    { group: "Shell, тоника на 6-й", rootString: 0, offsets: [0, n, -1, 1, n, n] },
    { group: "Shell, тоника на 5-й", rootString: 1, offsets: [n, 0, n, -1, 2, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 2, -1, 2, n] },
    { group: "Drop 2, струны 4–1", rootString: 2, offsets: [n, n, 0, 2, 0, 2] },
  ],
  m6: [
    { group: "Shell, тоника на 6-й", rootString: 0, offsets: [0, n, -1, 0, n, n] },
    { group: "Shell, тоника на 5-й", rootString: 1, offsets: [n, 0, n, -1, 1, n] },
    { group: "Drop 2, струны 5–2", rootString: 1, offsets: [n, 0, 2, -1, 1, n] },
    { group: "Drop 2, струны 4–1", rootString: 2, offsets: [n, n, 0, 2, 0, 1] },
  ],
  maj9: [{ group: "Тоника на 5-й", rootString: 1, offsets: [n, 0, -1, 1, 0, n] }],
  m9: [{ group: "Тоника на 5-й", rootString: 1, offsets: [n, 0, -2, 0, 0, n] }],
  "9": [{ group: "Тоника на 5-й", rootString: 1, offsets: [n, 0, -1, 0, 0, 0] }],
  "13": [{ group: "Тоника на 6-й", rootString: 0, offsets: [0, n, 0, 1, 2, n] }],
  maj: [
    { group: "Баррэ, тоника на 6-й", rootString: 0, offsets: [0, 2, 2, 1, 0, 0] },
    { group: "Баррэ, тоника на 5-й", rootString: 1, offsets: [n, 0, 2, 2, 2, 0] },
  ],
  m: [
    { group: "Баррэ, тоника на 6-й", rootString: 0, offsets: [0, 2, 2, 0, 0, 0] },
    { group: "Баррэ, тоника на 5-й", rootString: 1, offsets: [n, 0, 2, 2, 1, 0] },
  ],
};

export interface VoicingNote {
  string: number;
  fret: number;
  midi: number;
  label: string; // degree relative to the chord root: "1", "♭7"
  isRoot: boolean;
}

export interface Voicing {
  group: string;
  frets: (number | null)[];
  notes: VoicingNote[];
}

/** Concrete voicings of a chord in standard tuning. The lowest playable position is chosen. */
export function voicings(root: string, typeId: string, tuning: number[]): Voicing[] {
  const tones = chordTones(root, typeId);
  const rootChroma = chroma(parseNote(root));
  return (SHAPES[typeId] ?? []).map((shape) => {
    const offsets = shape.offsets.filter((o): o is number => o !== null);
    let rootFret = mod12(rootChroma - tuning[shape.rootString]);
    if (rootFret + Math.min(...offsets) < 0) rootFret += 12;
    const frets = shape.offsets.map((o) => (o === null ? null : rootFret + o));
    const notes = frets.flatMap((fret, string) => {
      if (fret === null) return [];
      const midi = tuning[string] + fret;
      const dist = mod12(midi - rootChroma);
      const tone = tones.find((t) => mod12(t.interval.semitones) === dist);
      return [{ string, fret, midi, label: tone ? tone.interval.label : "?", isRoot: dist === 0 }];
    });
    return { group: shape.group, frets, notes };
  });
}
