import { useMemo, useState } from "react";
import { Fretboard } from "@/components/fretboard/Fretboard";
import { FullscreenBoard } from "./FullscreenBoard";
import { ChordDiagram } from "@/components/fretboard/ChordDiagram";
import { Card, Chip, IconButton, ScrollRow, Segmented, SectionTitle } from "@/components/ui";
import { playNote, strum } from "@/audio/player";
import { CHORD_TYPES, chordTones, chordTypeById, isGuideTone, voicings } from "@/music/chords";
import { buildPatterns, fretNotes, STANDARD_TUNING, STRING_NAMES, type ChordHighlight, type FretNote } from "@/music/fretboard";
import { SCALES, diatonicChords, scaleById, scaleTones, type Tone } from "@/music/scales";
import { TONICS, noteName, parseNote } from "@/music/notes";
import { useSettings, type LabelMode } from "@/store/settings";

const highlightOf = (tones: Tone[]): ChordHighlight => ({
  tones,
  guide: new Set(tones.filter(isGuideTone).map((t) => t.chroma)),
});

export function TheoryPage() {
  const { theory, setTheory, fretboard, setFretboard } = useSettings();
  const [selected, setSelected] = useState<FretNote | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
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

  const position = theory.position >= view.patterns.length ? 0 : theory.position;
  const pattern = position >= 0 ? view.patterns[position] : null;
  const notes = fretNotes({ tones: view.tones, frets: fretboard.frets, chord: view.chord, pattern });
  const vs = view.voicingRoot && view.voicingType ? voicings(view.voicingRoot, view.voicingType, STANDARD_TUNING) : [];

  const labelOptions: { value: LabelMode; label: string }[] = [
    { value: "degree", label: tab === "chord" ? "Интервалы" : "Ступени" },
    { value: "note", label: "Ноты" },
    ...(tab === "scale" && view.chord ? [{ value: "chord" as const, label: "Аккорд" }] : []),
    ...(pattern ? [{ value: "finger" as const, label: "Пальцы" }] : []),
    { value: "none", label: "—" },
  ];
  const labelMode = labelOptions.some((o) => o.value === fretboard.labelMode) ? fretboard.labelMode : "degree";

  const tap = (n: FretNote) => {
    playNote(n.midi);
    setSelected((cur) => (cur?.key === n.key ? null : n));
  };
  const stepPosition = (d: number) => {
    const count = view.patterns.length;
    setTheory({ position: position < 0 ? (d > 0 ? 0 : count - 1) : (position + d + count) % count });
  };

  const positionLabel = position < 0 ? "Весь гриф" : `Позиция ${position + 1} из ${view.patterns.length}`;
  const togglePosition = () => setTheory({ position: position < 0 ? 0 : -1 });
  const boardProps = {
    notes,
    frets: fretboard.frets,
    labelMode,
    leftHanded: fretboard.leftHanded,
    showOutside: fretboard.showOutside,
    focus: pattern ? { min: pattern.minFret, max: pattern.maxFret } : { min: 0, max: 0 },
    selectedChroma: selected?.chroma ?? null,
    onTap: tap,
  };

  if (fullscreen) {
    return (
      <FullscreenBoard
        title={view.title}
        board={boardProps}
        positionLabel={positionLabel}
        onPrev={() => stepPosition(-1)}
        onNext={() => stepPosition(1)}
        onTogglePosition={togglePosition}
        labelMode={labelMode}
        labelOptions={labelOptions}
        onLabelMode={(v) => setFretboard({ labelMode: v })}
        onClose={() => setFullscreen(false)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-2xl font-bold">Теория</h1>
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

      <Card className="px-0 pb-2">
        <div className="flex items-start justify-between gap-2 px-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{view.title}</div>
            <div className="text-xs text-muted">{view.subtitle}</div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <IconButton label="Во весь экран" onClick={() => setFullscreen(true)}>
              ⤢
            </IconButton>
            <IconButton label="Уменьшить" onClick={() => setFretboard({ zoom: Math.max(0.6, +(fretboard.zoom - 0.15).toFixed(2)) })}>
              −
            </IconButton>
            <IconButton label="Увеличить" onClick={() => setFretboard({ zoom: Math.min(1.6, +(fretboard.zoom + 0.15).toFixed(2)) })}>
              +
            </IconButton>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 px-3">
          {view.tones.map((t) => (
            <span
              key={t.name + t.interval.label}
              className="rounded-lg px-2 py-1 text-xs font-semibold"
              style={{
                background: t.chroma === (view.chord?.tones[0].chroma ?? view.tones[0].chroma) ? "var(--root)" : "var(--surface-2)",
                color: t.chroma === (view.chord?.tones[0].chroma ?? view.tones[0].chroma) ? "var(--on-note)" : "var(--text)",
              }}
            >
              {t.name} <span className="opacity-60">{t.interval.label}</span>
            </span>
          ))}
        </div>

        <div className="mt-3">
          <Fretboard {...boardProps} zoom={fretboard.zoom} />
        </div>

        <div className="mt-1 min-h-6 px-3 text-sm">
          {selected ? (
            <span>
              <b>{selected.name}</b>
              {selected.degree && <> · ступень {selected.degree}</>}
              {selected.chordInterval && tab === "scale" && <> · в аккорде {selected.chordInterval}</>}
              <span className="text-muted">
                {" "}
                · струна {STRING_NAMES[selected.string]}, {selected.fret === 0 ? "открытая" : `${selected.fret} лад`}
              </span>
            </span>
          ) : (
            <span className="text-muted">Нажми на ноту, чтобы услышать её и увидеть все такие ноты на грифе</span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 px-3">
          <IconButton label="Предыдущая позиция" onClick={() => stepPosition(-1)}>
            ‹
          </IconButton>
          <button
            type="button"
            onClick={togglePosition}
            className="h-11 flex-1 rounded-2xl bg-surface-2 text-sm font-semibold"
          >
            {positionLabel}
          </button>
          <IconButton label="Следующая позиция" onClick={() => stepPosition(1)}>
            ›
          </IconButton>
        </div>

        <div className="mt-2 px-3">
          <Segmented size="sm" value={labelMode} onChange={(v) => setFretboard({ labelMode: v })} options={labelOptions} />
        </div>

        <Legend hasChord={!!view.chord} chordTab={tab === "chord"} />
      </Card>

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

function Legend({ hasChord, chordTab }: { hasChord: boolean; chordTab: boolean }) {
  const items = [
    { color: "var(--root)", label: "Тоника" },
    ...(hasChord
      ? [
          { color: "var(--guide)", label: "Терция и септима" },
          { color: "var(--chord)", label: "Звуки аккорда" },
        ]
      : []),
    ...(chordTab ? [] : [{ color: "transparent", label: "Лад", outline: true }]),
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-3 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: i.color, border: "outline" in i ? "1.5px solid var(--scale)" : undefined }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
