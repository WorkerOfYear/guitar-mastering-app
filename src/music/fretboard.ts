import { mod12 } from "./notes";
import type { Tone } from "./scales";

/** Open-string MIDI notes, low E → high e (E2 A2 D3 G3 B3 E4). */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];
export const STRING_NAMES = ["E", "A", "D", "G", "B", "e"];
export const MAX_FRET = 24;

const cellKey = (string: number, fret: number) => `${string}:${fret}`;

/** One fingering box: notes across all six strings, played in one hand position. */
export interface Pattern {
  cells: Set<string>;
  fingers: Map<string, number>;
  minFret: number;
  maxFret: number;
}

/**
 * Fingering boxes built the way guitarists learn them: start on the k-th scale note on the low E string,
 * then walk up the scale putting `perString` notes on each string (2 = pentatonic boxes and
 * two-notes-per-string arpeggios, 3 = three-notes-per-string modes).
 * `extra` notes (the blue note) are added wherever they fall inside a string's span.
 */
export function buildPatterns(
  tones: Tone[],
  tuning = STANDARD_TUNING,
  opts: { perString?: number; extra?: Tone[] } = {},
): Pattern[] {
  const chromas = [...new Set(tones.map((t) => t.chroma))];
  const perString = opts.perString ?? (chromas.length >= 7 ? 3 : 2);
  const inScale = (midi: number) => chromas.includes(mod12(midi));
  const extra = new Set((opts.extra ?? []).map((t) => t.chroma));

  return tones.map((startTone) => {
    let start = tuning[0] + mod12(startTone.chroma - tuning[0]);
    for (let attempt = 0; attempt < 2; attempt++, start += 12) {
      const frets: number[][] = [];
      let midi = start;
      for (let s = 0; s < tuning.length; s++) {
        const row: number[] = [];
        while (row.length < perString) {
          if (inScale(midi)) row.push(midi - tuning[s]);
          midi++;
        }
        frets.push(row);
      }
      const all = frets.flat();
      if (Math.min(...all) < 0) continue; // starts too low for the next strings: try an octave up
      const cells = new Set<string>();
      frets.forEach((row, s) => {
        row.forEach((f) => cells.add(cellKey(s, f)));
        if (extra.size) {
          for (let f = Math.min(...row); f <= Math.max(...row); f++) {
            if (extra.has(mod12(tuning[s] + f))) cells.add(cellKey(s, f));
          }
        }
      });
      const rows = tuning.map((_, s) => [...cells].filter((k) => k.startsWith(`${s}:`)).map((k) => Number(k.split(":")[1])));
      const fingers = new Map<string, number>();
      const base = handPosition(rows);
      rows.forEach((row, s) => fingerString(row, base).forEach((finger, f) => fingers.set(cellKey(s, f), finger)));
      return { cells, fingers, minFret: Math.min(...all), maxFret: Math.max(...all) };
    }
    throw new Error("No playable pattern");
  });
}

/**
 * Where the index finger sits for a box: the fret most strings start on (the lower one on a tie).
 * Pentatonic box 2 of A minor starts on frets 8 7 7 7 8 8 → the hand sits at fret 7.
 */
export function handPosition(rows: number[][]): number {
  const starts = rows.map((r) => r.filter((f) => f > 0)).filter((r) => r.length).map((r) => Math.min(...r));
  if (!starts.length) return 1;
  const count = (f: number) => starts.filter((x) => x === f).length;
  return [...new Set(starts)].sort((a, b) => count(b) - count(a) || a - b)[0];
}

/**
 * Fingers for the notes on one string (fret → finger, 0 for an open string), the way guitarists play boxes:
 * one finger per fret from the hand position; a string reaching past it shifts the hand on that string only;
 * a stretch wider than four frets goes index…pinky, the middle note by the closer step
 * (whole-whole and half-whole → 1-2-4, whole-half → 1-3-4). Different frets never share a finger.
 */
export function fingerString(frets: number[], base: number): Map<number, number> {
  const out = new Map<number, number>();
  const fretted = [...new Set(frets)].filter((f) => f > 0).sort((a, b) => a - b);
  if (frets.includes(0)) out.set(0, 0);
  if (!fretted.length) return out;
  const lo = fretted[0];
  const hi = fretted[fretted.length - 1];
  const assign = (from: number) => fretted.forEach((f) => out.set(f, f - from + 1));
  if (lo >= base && hi <= base + 3) assign(base);
  else if (hi - lo <= 3) assign(hi > base + 3 ? hi - 3 : lo);
  else if (fretted.length === 3) {
    const [a, b, c] = fretted;
    [a, b, c].forEach((f, i) => out.set(f, [1, b - a <= c - b ? 2 : 3, 4][i]));
  } else fretted.forEach((f, i) => out.set(f, i === fretted.length - 1 ? 4 : Math.min(i + 1, 3)));
  return out;
}

export type Role = "root" | "guide" | "chord" | "scale";

export interface FretNote {
  key: string;
  string: number;
  fret: number;
  midi: number;
  chroma: number;
  name: string;
  /** Degree relative to the scale (or chord) tonic */
  degree: string;
  /** Interval relative to the highlighted chord, when there is one */
  chordInterval?: string;
  role: Role;
  inPosition: boolean;
  finger?: number;
}

export interface ChordHighlight {
  tones: Tone[]; // spelled relative to the chord root
  guide: Set<number>; // chromas of 3rd and 7th
}

/** Every fret where a tone of the set sounds, with its role and labels. */
export function fretNotes(opts: {
  tones: Tone[];
  frets: number;
  tuning?: number[];
  chord?: ChordHighlight | null;
  pattern?: Pattern | null;
}): FretNote[] {
  const { tones, frets, chord, pattern } = opts;
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const byChroma = new Map(tones.map((t) => [t.chroma, t]));
  const chordByChroma = new Map((chord?.tones ?? []).map((t) => [t.chroma, t]));
  const rootChroma = chord ? chord.tones[0].chroma : tones[0].chroma;
  const out: FretNote[] = [];
  for (let s = 0; s < tuning.length; s++) {
    for (let f = 0; f <= frets; f++) {
      const midi = tuning[s] + f;
      const c = mod12(midi);
      const tone = byChroma.get(c) ?? chordByChroma.get(c);
      if (!tone) continue;
      const ct = chordByChroma.get(c);
      const role: Role = c === rootChroma ? "root" : chord?.guide.has(c) ? "guide" : ct ? "chord" : "scale";
      const key = cellKey(s, f);
      out.push({
        key,
        string: s,
        fret: f,
        midi,
        chroma: c,
        name: (byChroma.get(c) ?? tone).name,
        degree: byChroma.get(c)?.interval.label ?? "",
        chordInterval: ct?.interval.label,
        role,
        inPosition: !pattern || pattern.cells.has(key),
        finger: pattern?.fingers.get(key),
      });
    }
  }
  return out;
}
