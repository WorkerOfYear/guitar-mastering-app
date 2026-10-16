import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ChordDiagram } from "@/components/fretboard/ChordDiagram";
import { ScaleBoard } from "@/components/fretboard/ScaleBoard";
import { ChordSelect, ScaleSelect, TonicSelect } from "@/components/fretboard/TheorySelects";
import { Chip, ScrollRow, Segmented, SectionTitle } from "@/components/ui";
import { strum } from "@/audio/player";
import { voicings } from "@/music/chords";
import { STANDARD_TUNING } from "@/music/fretboard";
import { theoryView } from "@/music/theoryView";
import { useSettings } from "@/store/settings";
import { Glossary } from "./Glossary";

export function TheoryPage() {
  const { theory, setTheory } = useSettings();
  const { tab, tonic, scaleId, chordType, diatonic } = theory;
  // The glossary is a view of its own, kept in the address so "back" returns to it.
  const [params, setParams] = useSearchParams();
  const terms = params.get("view") === "terms";

  const view = useMemo(() => theoryView({ tab, tonic, scaleId, chordType, diatonic }), [tab, tonic, scaleId, chordType, diatonic]);

  const vs = view.voicingRoot && view.voicingType ? voicings(view.voicingRoot, view.voicingType, STANDARD_TUNING) : [];

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2 md:pr-14">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Теория</h1>
        <div className="flex items-center gap-2">
          <div className="w-72 max-[420px]:w-64">
            <Segmented
              value={terms ? "terms" : tab}
              onChange={(v) => {
                setParams(v === "terms" ? { view: "terms" } : {}, { replace: true });
                if (v !== "terms") setTheory({ tab: v, position: 0 });
              }}
              options={[
                { value: "scale", label: "Лады" },
                { value: "chord", label: "Аккорды" },
                { value: "terms", label: "Термины" },
              ]}
            />
          </div>
        </div>
      </header>

      {terms ? (
        <Glossary />
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
            <TonicSelect value={tonic} onChange={(t) => setTheory({ tonic: t })} />
            {tab === "scale" ? (
              <ScaleSelect value={scaleId} onChange={(id) => setTheory({ scaleId: id, diatonic: 0, position: 0 })} />
            ) : (
              <ChordSelect value={chordType} onChange={(id) => setTheory({ chordType: id, position: 0 })} />
            )}
          </div>

          <ScaleBoard
            tones={view.tones}
            chord={view.chord}
            patterns={view.patterns}
            position={theory.position}
            onPosition={(position) => setTheory({ position })}
            chordOnly={tab === "chord"}
          />

          {tab === "scale" && view.chords.length > 0 && (
            <>
              <SectionTitle>Аккорды лада</SectionTitle>
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
              <SectionTitle>Аппликатуры</SectionTitle>
              <ScrollRow>
                {vs.map((v) => (
                  <ChordDiagram key={v.group} voicing={v} title={v.group} onPlay={() => strum(v.notes.map((n) => n.midi))} />
                ))}
              </ScrollRow>
            </>
          )}
        </>
      )}
    </div>
  );
}
