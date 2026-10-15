import { chordTones, chordTypeById, isGuideTone } from "./chords";
import { buildPatterns, STANDARD_TUNING, type ChordHighlight, type Pattern } from "./fretboard";
import { diatonicChords, scaleById, scaleTones, type DiatonicChord, type Tone } from "./scales";
import { noteName, parseNote } from "./notes";
import type { TheoryLink } from "@/shared/types";

export interface TheoryChoice {
  tab: "scale" | "chord";
  tonic: string;
  scaleId: string;
  chordType: string;
  /** Degree (1..7) of the diatonic chord highlighted over the scale; 0 = none */
  diatonic: number;
}

/** An item's fretboard link with the blanks filled in. */
export const choiceOf = (link: TheoryLink): TheoryChoice => ({
  tab: link.tab,
  tonic: link.tonic,
  scaleId: link.scaleId ?? "ionian",
  chordType: link.chordType ?? "maj7",
  diatonic: link.diatonic ?? 0,
});

export const highlightOf = (tones: Tone[]): ChordHighlight => ({
  tones,
  guide: new Set(tones.filter(isGuideTone).map((t) => t.chroma)),
});

export interface TheoryView {
  title: string;
  subtitle: string;
  tones: Tone[];
  chord: ChordHighlight | null;
  patterns: Pattern[];
  /** Chords of the scale (empty for a chord) */
  chords: DiatonicChord[];
  voicingRoot?: string;
  voicingType?: string;
}

/** Everything the fretboard card needs for a scale (optionally with a diatonic chord) or a chord. */
export function theoryView({ tab, tonic, scaleId, chordType, diatonic }: TheoryChoice): TheoryView {
  if (tab === "chord") {
    const tones = chordTones(tonic, chordType);
    const type = chordTypeById(chordType);
    return {
      title: `${noteName(parseNote(tonic))}${type.symbol}`,
      subtitle: type.name,
      tones,
      chord: highlightOf(tones),
      patterns: buildPatterns(tones, STANDARD_TUNING, { perString: 2 }),
      chords: [],
      voicingRoot: tonic,
      voicingType: chordType,
    };
  }
  const scale = scaleById(scaleId);
  const tones = scaleTones(tonic, scaleId);
  const chords = diatonicChords(tonic, scaleId);
  const dc = chords.find((c) => c.degree === diatonic);
  const chordToneSet = dc ? (dc.typeId ? chordTones(dc.rootName, dc.typeId) : dc.tones) : null;
  const base = scale.patternBase ? scaleTones(tonic, scale.patternBase) : tones;
  return {
    title: `${noteName(parseNote(tonic))} — ${scale.name.toLowerCase()}`,
    subtitle: dc ? `Аккорд ${dc.roman}: ${dc.symbol}` : `${tones.length} нот`,
    tones,
    chord: chordToneSet ? highlightOf(chordToneSet) : null,
    patterns: buildPatterns(base, STANDARD_TUNING, { extra: scale.patternBase ? tones : undefined }),
    chords,
    voicingRoot: dc?.rootName,
    voicingType: dc?.typeId,
  };
}
