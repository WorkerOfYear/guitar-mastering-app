// The small slice of music theory the app needs: spelled pitch classes and intervals.
// Notes are spelled by scale degree (F major has B♭, not A♯), so every degree gets its own letter.

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_CHROMA = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11]; // degrees 1..7 of the major scale

/** A spelled pitch class: letter index (C=0 … B=6) plus accidental (−2…+2). */
export interface PitchClass {
  letter: number;
  acc: number;
}

/** An interval from a root, written as a scale degree: "1", "b3", "#4", "bb7", "9", "13". */
export interface Interval {
  /** Degree number as written, 1…13 */
  degree: number;
  /** Distance in semitones (may exceed 12 for 9, 11, 13) */
  semitones: number;
  /** Display form: "♭3", "♯11" */
  label: string;
}

const prettyAcc = (acc: number) => (acc < 0 ? "♭".repeat(-acc) : "♯".repeat(acc));
const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function parseInterval(text: string): Interval {
  const m = /^(b{1,2}|#{1,2})?(\d{1,2})$/.exec(text);
  if (!m) throw new Error(`Bad interval: ${text}`);
  const acc = m[1] ? (m[1][0] === "b" ? -m[1].length : m[1].length) : 0;
  const degree = Number(m[2]);
  if (degree < 1) throw new Error(`Bad interval: ${text}`);
  const simple = (degree - 1) % 7;
  const octaves = Math.floor((degree - 1) / 7);
  return { degree, semitones: MAJOR_SEMITONES[simple] + 12 * octaves + acc, label: prettyAcc(acc) + degree };
}

/** "Eb", "F#", "C" → pitch class. Accepts ASCII b/# and ♭/♯. */
export function parseNote(text: string): PitchClass {
  const m = /^([A-Ga-g])(b{1,2}|#{1,2}|♭{1,2}|♯{1,2})?$/.exec(text.trim());
  if (!m) throw new Error(`Bad note: ${text}`);
  const letter = LETTERS.indexOf(m[1].toUpperCase() as (typeof LETTERS)[number]);
  const a = m[2] || "";
  const acc = a ? (a[0] === "b" || a[0] === "♭" ? -a.length : a.length) : 0;
  return { letter, acc };
}

export const chroma = (pc: PitchClass) => mod12(LETTER_CHROMA[pc.letter] + pc.acc);

/** Display name with ♭/♯: "E♭", "F♯". */
export const noteName = (pc: PitchClass) => LETTERS[pc.letter] + prettyAcc(pc.acc);

/** Note at `interval` above `root`, spelled with the letter of that degree. */
export function transpose(root: PitchClass, interval: Interval): PitchClass {
  const letter = (root.letter + interval.degree - 1) % 7;
  const target = mod12(chroma(root) + interval.semitones);
  let acc = target - LETTER_CHROMA[letter];
  if (acc > 6) acc -= 12;
  if (acc < -6) acc += 12;
  return { letter, acc };
}

/** Degree label for any semitone distance, used for notes that are not part of a spelled set. */
const CHROMATIC_DEGREES = ["1", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♭6", "6", "♭7", "7"];
export const chromaticDegree = (semitones: number) => CHROMATIC_DEGREES[mod12(semitones)];

/** Tonic choices, spelled the way guitarists usually name keys. */
export const TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export type Tonic = (typeof TONICS)[number];

export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export { mod12 };
