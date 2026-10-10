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
      const minFret = Math.min(...all);
      const base = Math.max(1, minFret);
      const fingers = new Map<string, number>();
      for (const key of cells) {
        const f = Number(key.split(":")[1]);
        fingers.set(key, f === 0 ? 0 : Math.min(4, Math.max(1, f - base + 1)));
      }
      return { cells, fingers, minFret, maxFret: Math.max(...all) };
    }
    throw new Error("No playable pattern");
  });
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
