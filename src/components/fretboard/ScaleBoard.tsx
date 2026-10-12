import { useState, type ReactNode } from "react";
import { Fretboard } from "./Fretboard";
import { FullscreenBoard } from "./FullscreenBoard";
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button, Card, IconButton, Segmented } from "@/components/ui";
import { playNote } from "@/audio/player";
import { isGuideTone } from "@/music/chords";
import { fretNotes, STRING_NAMES, type ChordHighlight, type FretNote, type Pattern } from "@/music/fretboard";
import type { Tone } from "@/music/scales";
import { useSettings, type LabelMode } from "@/store/settings";

export const highlightOf = (tones: Tone[]): ChordHighlight => ({
  tones,
  guide: new Set(tones.filter(isGuideTone).map((t) => t.chroma)),
});

interface Props {
  title: string;
  subtitle?: ReactNode;
  tones: Tone[];
  chord: ChordHighlight | null;
  patterns: Pattern[];
  /** Index of the box; −1 = whole neck. Out-of-range values fall back to the first box. */
  position: number;
  onPosition: (position: number) => void;
  /** The tones are a chord (arpeggio), not a scale with a chord on top */
  chordOnly?: boolean;
}

/** Fretboard card: tones, board, tapped-note info, position stepper, label switch, legend, fullscreen. */
export function ScaleBoard({ title, subtitle, tones, chord, patterns, position: rawPosition, onPosition, chordOnly }: Props) {
  const { fretboard, setFretboard } = useSettings();
  const [selected, setSelected] = useState<FretNote | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const position = rawPosition >= patterns.length ? 0 : rawPosition;
  const pattern = position >= 0 ? patterns[position] : null;
  const notes = fretNotes({ tones, frets: fretboard.frets, chord, pattern });

  const labelOptions: { value: LabelMode; label: string }[] = [
    { value: "degree", label: chordOnly ? "Интервалы" : "Ступени" },
    { value: "note", label: "Ноты" },
    ...(!chordOnly && chord ? [{ value: "chord" as const, label: "Аккорд" }] : []),
    ...(pattern ? [{ value: "finger" as const, label: "Пальцы" }] : []),
    { value: "none", label: "—" },
  ];
  const labelMode = labelOptions.some((o) => o.value === fretboard.labelMode) ? fretboard.labelMode : "degree";

  const tap = (n: FretNote) => {
    playNote(n.midi);
    setSelected((cur) => (cur?.key === n.key ? null : n));
  };
  const step = (d: number) => {
    const count = patterns.length;
    onPosition(position < 0 ? (d > 0 ? 0 : count - 1) : (position + d + count) % count);
  };
  const positionLabel = position < 0 ? "Весь гриф" : `Позиция ${position + 1} из ${patterns.length}`;
  const togglePosition = () => onPosition(position < 0 ? 0 : -1);
  const rootChroma = chord?.tones[0].chroma ?? tones[0]?.chroma;

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
        title={title}
        board={boardProps}
        positionLabel={positionLabel}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onTogglePosition={togglePosition}
        labelMode={labelMode}
        labelOptions={labelOptions}
        onLabelMode={(v) => setFretboard({ labelMode: v })}
        onClose={() => setFullscreen(false)}
      />
    );
  }

  return (
    <Card className="px-0 pb-3">
      <div className="flex items-start justify-between gap-2 px-4">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{title}</div>
          {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <IconButton label="Во весь экран" onClick={() => setFullscreen(true)}>
            <Maximize2 className="size-4" />
          </IconButton>
          <IconButton label="Уменьшить" onClick={() => setFretboard({ zoom: Math.max(0.6, +(fretboard.zoom - 0.15).toFixed(2)) })}>
            <ZoomOut className="size-4" />
          </IconButton>
          <IconButton label="Увеличить" onClick={() => setFretboard({ zoom: Math.min(1.6, +(fretboard.zoom + 0.15).toFixed(2)) })}>
            <ZoomIn className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 px-4">
        {tones.map((t) => (
          <span
            key={t.name + t.interval.label}
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: t.chroma === rootChroma ? "var(--root)" : "var(--surface-2)",
              color: t.chroma === rootChroma ? "var(--on-note)" : "var(--text)",
            }}
          >
            {t.name} <span className="opacity-60">{t.interval.label}</span>
          </span>
        ))}
      </div>

      <div className="mt-3">
        <Fretboard {...boardProps} zoom={fretboard.zoom} />
      </div>

      <div className="mt-1 min-h-6 px-4 text-sm">
        {selected ? (
          <span>
            <b>{selected.name}</b>
            {selected.degree && <> · ступень {selected.degree}</>}
            {selected.chordInterval && !chordOnly && <> · в аккорде {selected.chordInterval}</>}
            <span className="text-muted">
              {" "}
              · струна {STRING_NAMES[selected.string]}, {selected.fret === 0 ? "открытая" : `${selected.fret} лад`}
            </span>
          </span>
        ) : (
          <span className="text-muted">Нажми на ноту, чтобы услышать её и увидеть все такие ноты на грифе</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 px-4">
        <IconButton label="Предыдущая позиция" onClick={() => step(-1)}>
          <ChevronLeft />
        </IconButton>
        <Button variant="secondary" onClick={togglePosition} className="h-11 flex-1">
          {positionLabel}
        </Button>
        <IconButton label="Следующая позиция" onClick={() => step(1)}>
          <ChevronRight />
        </IconButton>
      </div>

      <div className="mt-2 px-4">
        <Segmented size="sm" value={labelMode} onChange={(v) => setFretboard({ labelMode: v })} options={labelOptions} />
      </div>

      <Legend hasChord={!!chord} chordOnly={!!chordOnly} />
    </Card>
  );
}

function Legend({ hasChord, chordOnly }: { hasChord: boolean; chordOnly: boolean }) {
  const items = [
    { color: "var(--root)", label: "Тоника" },
    ...(hasChord
      ? [
          { color: "var(--guide)", label: "Терция и септима" },
          { color: "var(--chord)", label: "Звуки аккорда" },
        ]
      : []),
    ...(chordOnly ? [] : [{ color: "transparent", label: "Лад", outline: true }]),
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-4 text-xs text-muted">
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
