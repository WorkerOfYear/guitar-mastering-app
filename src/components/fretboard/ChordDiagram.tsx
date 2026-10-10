import type { Voicing } from "@/music/chords";

interface Props {
  voicing: Voicing;
  title?: string;
  onPlay?: () => void;
}

const LEFT = 22;
const STRING_GAP = 17;
const TOP = 30;
const FRET_GAP = 24;
const R = 8;

const isGuide = (label: string) => /(^|[^\d])(3|7)$/.test(label);

/** Vertical chord box: low E on the left, nut (or the starting fret) at the top. */
export function ChordDiagram({ voicing, title, onPlay }: Props) {
  const played = voicing.notes.map((n) => n.fret);
  const fretted = played.filter((f) => f > 0);
  const maxFret = Math.max(0, ...fretted);
  const base = maxFret <= 4 ? 1 : Math.min(...fretted);
  const rows = Math.max(4, maxFret - base + 1);
  const width = LEFT + STRING_GAP * 5 + 18;
  const height = TOP + FRET_GAP * rows + 8;
  const sx = (s: number) => LEFT + s * STRING_GAP;

  return (
    <button
      type="button"
      onClick={onPlay}
      className="flex shrink-0 flex-col items-center rounded-2xl border border-line bg-surface px-2 pb-2 pt-1 active:scale-[0.97]"
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={title}>
        {base === 1 ? (
          <rect x={sx(0)} y={TOP - 4} width={STRING_GAP * 5} height={4} fill="var(--text)" />
        ) : (
          <text x={LEFT - 8} y={TOP + FRET_GAP / 2 + 4} fontSize={10} textAnchor="end" fill="var(--muted)">
            {base}
          </text>
        )}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={i} x1={sx(0)} x2={sx(5)} y1={TOP + i * FRET_GAP} y2={TOP + i * FRET_GAP} stroke="var(--border)" strokeWidth={1.5} />
        ))}
        {Array.from({ length: 6 }, (_, s) => (
          <line key={s} x1={sx(s)} x2={sx(s)} y1={TOP} y2={TOP + rows * FRET_GAP} stroke="var(--muted)" strokeWidth={1} />
        ))}
        {voicing.frets.map((f, s) =>
          f === null ? (
            <text key={s} x={sx(s)} y={TOP - 10} fontSize={11} textAnchor="middle" fill="var(--muted)">
              ×
            </text>
          ) : f === 0 ? (
            <circle key={s} cx={sx(s)} cy={TOP - 14} r={4} fill="none" stroke="var(--muted)" strokeWidth={1.4} />
          ) : null,
        )}
        {voicing.notes
          .filter((n) => n.fret > 0)
          .map((n) => {
            const cy = TOP + (n.fret - base + 0.5) * FRET_GAP;
            const fill = n.isRoot ? "var(--root)" : isGuide(n.label) ? "var(--guide)" : "var(--chord)";
            return (
              <g key={n.string} transform={`translate(${sx(n.string)} ${cy})`}>
                <circle r={R} fill={fill} />
                <text y={3.2} fontSize={n.label.length > 2 ? 7.5 : 9} fontWeight={700} textAnchor="middle" fill="var(--on-note)">
                  {n.label}
                </text>
              </g>
            );
          })}
      </svg>
      {title && <span className="max-w-[120px] text-center text-[11px] leading-tight text-muted">{title}</span>}
    </button>
  );
}
