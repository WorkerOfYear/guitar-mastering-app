import { useState } from "react";
import { Fretboard } from "./Fretboard";
import { Card, Segmented } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { playNote } from "@/audio/player";
import { fretNotes, type ChordHighlight, type FretNote, type Pattern } from "@/music/fretboard";
import type { Tone } from "@/music/scales";
import { useSettings, type LabelMode } from "@/store/settings";

export { highlightOf } from "@/music/theoryView";

interface Props {
  /** Shown where nothing else names the scale (the Theory screen has its dropdowns instead) */
  title?: string;
  tones: Tone[];
  chord: ChordHighlight | null;
  patterns: Pattern[];
  /** Index of the box; −1 = whole neck. Out-of-range values fall back to the first box. */
  position: number;
  onPosition: (position: number) => void;
  /** The tones are a chord (arpeggio), not a scale with a chord on top */
  chordOnly?: boolean;
}

/** Fretboard card: the whole neck across the full width, the same size for every position (a tapped note sounds and lights up its twins), position blocks, label switch, legend. */
export function ScaleBoard({ title, tones, chord, patterns, position: rawPosition, onPosition, chordOnly }: Props) {
  const { fretboard, setFretboard } = useSettings();
  const [selected, setSelected] = useState<FretNote | null>(null);

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
  return (
    <Card className="px-0 pb-3">
      {title && <div className="truncate px-4 pb-2 text-lg font-bold">{title}</div>}
      <Fretboard
        notes={notes}
        frets={fretboard.frets}
        labelMode={labelMode}
        leftHanded={fretboard.leftHanded}
        showOutside={fretboard.showOutside}
        selectedChroma={selected?.chroma ?? null}
        onTap={tap}
      />

      {/* Tap a box to light it up, tap it again for the whole neck. */}
      <div role="group" aria-label="Позиция" className="mt-2 grid gap-1.5 px-4" style={{ gridTemplateColumns: `repeat(${patterns.length}, minmax(0, 1fr))` }}>
        {patterns.map((_, i) => (
          <PositionBlock key={i} n={i + 1} active={position === i} onClick={() => onPosition(position === i ? -1 : i)} />
        ))}
      </div>

      <div className="mt-2 px-4">
        <Segmented size="sm" value={labelMode} onChange={(v) => setFretboard({ labelMode: v })} options={labelOptions} />
      </div>

      <Legend hasChord={!!chord} chordOnly={!!chordOnly} />
    </Card>
  );
}

/** One fingering box as a toggle. */
function PositionBlock({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`Позиция ${n}`}
      onClick={() => {
        haptic();
        onClick();
      }}
      className={cn(
        "flex h-11 items-center justify-center rounded-2xl border text-base font-bold transition-[background-color,border-color,transform] active:scale-[0.97]",
        active ? "border-accent bg-accent/12 text-accent" : "border-line text-fg hover:bg-surface-2",
      )}
    >
      {n}
    </button>
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
