import { useMemo } from "react";
import { ChordDiagram } from "@/components/fretboard/ChordDiagram";
import { ScaleBoard } from "@/components/fretboard/ScaleBoard";
import { Chip, ScrollRow, Segmented, SectionTitle } from "@/components/ui";
import { strum } from "@/audio/player";
import { CHORD_TYPES, voicings } from "@/music/chords";
import { STANDARD_TUNING } from "@/music/fretboard";
import { SCALES } from "@/music/scales";
import { theoryView } from "@/music/theoryView";
import { TONICS, noteName, parseNote } from "@/music/notes";
import { useSettings } from "@/store/settings";
import { HeaderNav } from "@/app/Nav";

export function TheoryPage() {
  const { theory, setTheory } = useSettings();
  const { tab, tonic, scaleId, chordType, diatonic } = theory;

  const view = useMemo(() => theoryView({ tab, tonic, scaleId, chordType, diatonic }), [tab, tonic, scaleId, chordType, diatonic]);

  const vs = view.voicingRoot && view.voicingType ? voicings(view.voicingRoot, view.voicingType, STANDARD_TUNING) : [];

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Теория</h1>
        <div className="flex items-center gap-2">
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
          <HeaderNav />
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
