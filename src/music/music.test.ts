import { describe, expect, it } from "vitest";
import { parseInterval, parseNote, transpose, noteName } from "./notes";
import { SCALES, scaleTones, diatonicChords, scaleById } from "./scales";
import { CHORD_TYPES, chordTones, voicings } from "./chords";
import { buildPatterns, fretNotes, STANDARD_TUNING } from "./fretboard";

const names = (tonic: string, id: string) => scaleTones(tonic, id).map((t) => t.name).join(" ");
const shape = (p: { cells: Set<string> }) =>
  [0, 1, 2, 3, 4, 5].map((s) => [...p.cells].filter((k) => k.startsWith(`${s}:`)).map((k) => Number(k.split(":")[1])).sort((a, b) => a - b));

/** Fingers per string, low E first, in fret order. */
const fingersOf = (p: { cells: Set<string>; fingers: Map<string, number> }) => shape(p).map((row, s) => row.map((f) => p.fingers.get(`${s}:${f}`)));

describe("notes", () => {
  it("parses intervals", () => {
    expect(parseInterval("b3").semitones).toBe(3);
    expect(parseInterval("#4").semitones).toBe(6);
    expect(parseInterval("bb7").semitones).toBe(9);
    expect(parseInterval("13").semitones).toBe(21);
    expect(parseInterval("b7").label).toBe("♭7");
  });
  it("spells by degree", () => {
    expect(noteName(transpose(parseNote("F"), parseInterval("4")))).toBe("B♭");
    expect(noteName(transpose(parseNote("E"), parseInterval("3")))).toBe("G♯");
    expect(noteName(transpose(parseNote("C"), parseInterval("bb7")))).toBe("B♭♭");
  });
});

describe("scales", () => {
  it("spells modes and pentatonics", () => {
    expect(names("A", "minor-pentatonic")).toBe("A C D E G");
    expect(names("F", "ionian")).toBe("F G A B♭ C D E");
    expect(names("Eb", "dorian")).toBe("E♭ F G♭ A♭ B♭ C D♭");
    expect(names("A", "harmonic-minor")).toBe("A B C D E F G♯");
    expect(names("E", "phrygian-dominant")).toBe("E F G♯ A B C D");
    expect(names("A", "blues")).toBe("A C D E♭ E G");
  });
  it("builds diatonic seventh chords", () => {
    expect(diatonicChords("C", "ionian").map((c) => c.symbol)).toEqual(["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Bm7♭5"]);
    expect(diatonicChords("C", "ionian").map((c) => c.roman)).toEqual(["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"]);
    expect(diatonicChords("A", "aeolian").map((c) => c.roman)).toEqual(["i7", "iiø7", "♭IIImaj7", "iv7", "v7", "♭VImaj7", "♭VII7"]);
    expect(diatonicChords("A", "harmonic-minor")[4].symbol).toBe("E7");
    expect(diatonicChords("A", "minor-pentatonic")).toEqual([]);
  });
});

describe("patterns", () => {
  it("gives the five classic minor pentatonic boxes", () => {
    const boxes = buildPatterns(scaleTones("A", "minor-pentatonic"));
    expect(boxes).toHaveLength(5);
    expect(shape(boxes[0])).toEqual([[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
    expect(shape(boxes[1])).toEqual([[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]]);
  });
  it("gives three-notes-per-string modes", () => {
    const boxes = buildPatterns(scaleTones("G", "ionian"));
    expect(boxes).toHaveLength(7);
    expect(shape(boxes[0])).toEqual([[3, 5, 7], [3, 5, 7], [4, 5, 7], [4, 5, 7], [5, 7, 8], [5, 7, 8]]);
  });
  it("adds the blue note inside pentatonic boxes", () => {
    const blues = scaleTones("A", "blues");
    const base = scaleTones("A", scaleById("blues").patternBase!);
    const [box] = buildPatterns(base, STANDARD_TUNING, { extra: blues });
    expect(shape(box)[1]).toEqual([5, 6, 7]); // E♭ on the A string
  });
  it("fingers pentatonic boxes the standard way", () => {
    const boxes = buildPatterns(scaleTones("A", "minor-pentatonic"));
    expect(fingersOf(boxes[0])).toEqual([[1, 4], [1, 3], [1, 3], [1, 3], [1, 4], [1, 4]]);
    expect(fingersOf(boxes[1])).toEqual([[2, 4], [1, 4], [1, 4], [1, 3], [2, 4], [2, 4]]);
    // Box 3: the hand sits at fret 10, the G string reaches back to 9 with the index.
    expect(fingersOf(boxes[2])).toEqual([[1, 3], [1, 3], [1, 3], [1, 4], [1, 4], [1, 3]]);
  });
  it("fingers three-notes-per-string modes 1-2-4 / 1-3-4", () => {
    const [box] = buildPatterns(scaleTones("G", "ionian"));
    // whole-whole 1-2-4, half-whole 1-2-4, whole-half 1-3-4
    expect(fingersOf(box)).toEqual([[1, 2, 4], [1, 2, 4], [1, 2, 4], [1, 2, 4], [1, 3, 4], [1, 3, 4]]);
  });
  it("never puts one finger on two frets of a string", () => {
    for (const tonic of ["C", "E", "F#", "Ab", "B"])
      for (const def of SCALES)
        for (const p of buildPatterns(scaleTones(tonic, def.patternBase ?? def.id), STANDARD_TUNING, { extra: def.patternBase ? scaleTones(tonic, def.id) : undefined }))
          for (const row of fingersOf(p)) {
            const fretted = row.filter((f): f is number => f! > 0);
            expect(new Set(fretted).size).toBe(fretted.length);
            for (const f of fretted) expect(f).toBeLessThanOrEqual(4);
          }
    for (const c of CHORD_TYPES)
      for (const p of buildPatterns(chordTones("A", c.id), STANDARD_TUNING, { perString: 2 }))
        for (const row of fingersOf(p)) expect(new Set(row.filter((f) => f! > 0)).size).toBe(row.filter((f) => f! > 0).length);
  });
  it("never produces negative frets", () => {
    for (const tonic of ["C", "E", "F", "Ab"]) {
      for (const p of buildPatterns(scaleTones(tonic, "major-pentatonic"))) expect(p.minFret).toBeGreaterThanOrEqual(0);
      for (const p of buildPatterns(scaleTones(tonic, "altered"))) expect(p.minFret).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("chords", () => {
  it("spells chord tones", () => {
    expect(chordTones("C", "m7b5").map((t) => t.name)).toEqual(["C", "E♭", "G♭", "B♭"]);
    expect(chordTones("Bb", "13").map((t) => t.name)).toEqual(["B♭", "D", "F", "A♭", "C", "G"]);
  });
  it("places voicings with correct notes", () => {
    const [shell6, shell5, drop2a] = voicings("G", "maj7", STANDARD_TUNING);
    expect(shell6.frets).toEqual([3, null, 4, 4, null, null]);
    expect(shell6.notes.map((n) => n.label)).toEqual(["1", "7", "3"]);
    expect(shell5.frets).toEqual([null, 10, null, 11, 12, null]);
    expect(drop2a.notes.map((n) => n.label)).toEqual(["1", "5", "7", "3"]);
    for (const type of ["maj7", "m7", "7", "m7b5", "dim7", "6", "m6", "9", "maj9", "m9", "13", "mMaj7", "maj", "m"]) {
      for (const tonic of ["C", "F#", "Bb", "E"]) {
        for (const v of voicings(tonic, type, STANDARD_TUNING)) {
          expect(v.notes.every((n) => n.label !== "?"), `${tonic}${type} ${v.group}`).toBe(true);
          expect(Math.min(...v.notes.map((n) => n.fret))).toBeGreaterThanOrEqual(0);
          expect(v.notes.find((n) => n.string === Math.min(...v.notes.map((x) => x.string)))?.isRoot).toBe(true);
        }
      }
    }
  });
});

describe("fretNotes", () => {
  it("marks roles and chord intervals", () => {
    const tones = scaleTones("C", "ionian");
    const chord = diatonicChords("C", "ionian")[4]; // G7
    const g7 = chordTones("G", "7");
    const notes = fretNotes({ tones, frets: 12, chord: { tones: g7, guide: new Set([g7[1].chroma, g7[3].chroma]) } });
    const at = (s: number, f: number) => notes.find((n) => n.string === s && n.fret === f)!;
    expect(chord.symbol).toBe("G7");
    expect(at(0, 3).role).toBe("root"); // G
    expect(at(0, 3).degree).toBe("5");
    expect(at(0, 1).role).toBe("guide"); // F = ♭7 of G7
    expect(at(0, 1).chordInterval).toBe("♭7");
    expect(at(0, 0).role).toBe("scale"); // E
  });
});
