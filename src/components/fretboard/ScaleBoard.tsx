import { useState } from "react";
import { Fretboard } from "./Fretboard";
import { FullscreenBoard } from "./FullscreenBoard";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Card, IconButton, Segmented } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { playNote } from "@/audio/player";
import { fretNotes, type ChordHighlight, type FretNote, type Pattern } from "@/music/fretboard";
import type { Tone } from "@/music/scales";
import { useSettings, type LabelMode } from "@/store/settings";

export { highlightOf } from "@/music/theoryView";

interface Props {
  title: string;
  tones: Tone[];
  chord: ChordHighlight | null;
  patterns: Pattern[];
  /** Index of the box; −1 = whole neck. Out-of-range values fall back to the first box. */
  position: number;
  onPosition: (position: number) => void;
  /** The tones are a chord (arpeggio), not a scale with a chord on top */
  chordOnly?: boolean;
}

/** Fretboard card: tones, board (a tapped note sounds and lights up its twins), position blocks, label switch, legend, fullscreen. */
export function ScaleBoard({ title, tones, chord, patterns, position: rawPosition, onPosition, chordOnly }: Props) {
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
        <div className="min-w-0 truncate text-lg font-bold">{title}</div>
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

      <div role="radiogroup" aria-label="Позиция" className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5 px-4">
        <PositionBlock active={position < 0} onClick={() => onPosition(-1)} title="Весь" sub="гриф" />
        {patterns.map((p, i) => (
          <PositionBlock key={i} active={position === i} onClick={() => onPosition(i)} title={String(i + 1)} sub={fretRange(p)} />
        ))}
      </div>

      <div className="mt-2 px-4">
        <Segmented size="sm" value={labelMode} onChange={(v) => setFretboard({ labelMode: v })} options={labelOptions} />
      </div>

      <Legend hasChord={!!chord} chordOnly={!!chordOnly} />
    </Card>
  );
}

/** "лады 5–8", or "откр.–3" for a box that starts on open strings. */
const fretRange = (p: Pattern) => `${p.minFret === 0 ? "откр." : p.minFret}–${p.maxFret}`;

/** One fingering box (or the whole neck) as a tappable block. */
function PositionBlock({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={title === "Весь" ? "Весь гриф" : `Позиция ${title}, лады ${sub}`}
      onClick={() => {
        haptic();
        onClick();
      }}
      className={cn(
        "flex h-14 flex-col items-center justify-center rounded-2xl border transition-[background-color,border-color,transform] active:scale-[0.97]",
        active ? "border-accent bg-accent/12 text-accent" : "border-line text-fg hover:bg-surface-2",
      )}
    >
      <span className="text-base font-bold leading-tight">{title}</span>
      <span className={cn("text-[11px] leading-tight", active ? "text-accent" : "text-muted")}>{sub}</span>
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
