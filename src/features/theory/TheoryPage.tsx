import { useMemo } from "react";
import { ChordDiagram } from "@/components/fretboard/ChordDiagram";
import { ScaleBoard, highlightOf } from "@/components/fretboard/ScaleBoard";
import { Chip, ScrollRow, Segmented, SectionTitle } from "@/components/ui";
import { strum } from "@/audio/player";
import { CHORD_TYPES, chordTones, chordTypeById, voicings } from "@/music/chords";
import { buildPatterns, STANDARD_TUNING } from "@/music/fretboard";
import { SCALES, diatonicChords, scaleById, scaleTones } from "@/music/scales";
import { TONICS, noteName, parseNote } from "@/music/notes";
import { useSettings } from "@/store/settings";

export function TheoryPage() {
  const { theory, setTheory } = useSettings();
  const { tab, tonic, scaleId, chordType, diatonic } = theory;
  const scale = scaleById(scaleId);

  const view = useMemo(() => {
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
  }, [tab, tonic, scaleId, chordType, diatonic, scale]);

  const vs = view.voicingRoot && view.voicingType ? voicings(view.voicingRoot, view.voicingType, STANDARD_TUNING) : [];

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Теория</h1>
        <div className="w-52">
          <Segmented
            value={tab}
            onChange={(v) => setTheory({ tab: v, position: 0 })}
            options={[
              { value: "scale", label: "Лады" },
              { value: "chord", label: "Аккорды" },
            ]}
          />
        </div>
      </header>

      <ScrollRow>
        {TONICS.map((t) => (
          <Chip key={t} active={t === tonic} onClick={() => setTheory({ tonic: t })}>
            {noteName(parseNote(t))}
          </Chip>
        ))}
      </ScrollRow>

      {tab === "scale" ? (
        <ScrollRow>
          {SCALES.map((s) => (
            <Chip key={s.id} active={s.id === scaleId} sub={s.group} onClick={() => setTheory({ scaleId: s.id, diatonic: 0, position: 0 })}>
              {s.name}
            </Chip>
          ))}
        </ScrollRow>
      ) : (
        <ScrollRow>
          {CHORD_TYPES.map((c) => (
            <Chip key={c.id} active={c.id === chordType} onClick={() => setTheory({ chordType: c.id, position: 0 })}>
              {c.symbol || "maj"}
            </Chip>
          ))}
        </ScrollRow>
      )}

      <ScaleBoard
        title={view.title}
        subtitle={view.subtitle}
        tones={view.tones}
        chord={view.chord}
        patterns={view.patterns}
        position={theory.position}
        onPosition={(position) => setTheory({ position })}
        chordOnly={tab === "chord"}
      />

      {tab === "scale" && view.chords.length > 0 && (
        <>
          <SectionTitle>Аккорды лада — нажми, чтобы подсветить</SectionTitle>
          <ScrollRow>
            {view.chords.map((c) => (
              <Chip key={c.degree} active={c.degree === diatonic} sub={c.symbol} onClick={() => setTheory({ diatonic: c.degree === diatonic ? 0 : c.degree })}>
                {c.roman}
              </Chip>
            ))}
          </ScrollRow>
        </>
      )}

      {vs.length > 0 && (
        <>
          <SectionTitle>Аппликатуры — нажми, чтобы сыграть</SectionTitle>
          <ScrollRow>
            {vs.map((v) => (
              <ChordDiagram key={v.group} voicing={v} title={v.group} onPlay={() => strum(v.notes.map((n) => n.midi))} />
            ))}
          </ScrollRow>
        </>
      )}
    </div>
  );
}
