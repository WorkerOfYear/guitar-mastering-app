import { useMemo } from "react";
import type { FretNote } from "@/music/fretboard";
import { STRING_NAMES } from "@/music/fretboard";
import type { LabelMode } from "@/store/settings";

interface Props {
  notes: FretNote[];
  frets: number;
  labelMode: LabelMode;
  leftHanded?: boolean;
  /** Dimmed notes outside the selected position are drawn only when true */
  showOutside?: boolean;
  /** Frets to show (the selected position); the whole neck when missing. Either way the board fills the width. */
  range?: { min: number; max: number } | null;
  selectedChroma?: number | null;
  onTap?: (note: FretNote) => void;
}

const TOP = 26;
const GAP = 36; // between strings
const NUT_X = 64; // open-string notes sit to the left of the nut
const R = 14;
const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];

/** Frets get narrower up the neck like a real guitar, but gentler so high frets stay tappable. */
function wirePositions(frets: number) {
  const wires = [NUT_X];
  for (let n = 1; n <= frets; n++) wires.push(wires[n - 1] + 70 * 0.96 ** (n - 1));
  return wires;
}

const ROLE_FILL: Record<FretNote["role"], string> = {
  root: "var(--root)",
  guide: "var(--guide)",
  chord: "var(--chord)",
  scale: "var(--surface)",
};

function label(n: FretNote, mode: LabelMode) {
  switch (mode) {
    case "note":
      return n.name;
    case "degree":
      return n.degree;
    case "chord":
      return n.chordInterval ?? "";
    case "finger":
      return n.finger === undefined ? "" : String(n.finger);
    default:
      return "";
  }
}

/** Natural size of the whole board in SVG units. */
export function fretboardSize(frets: number) {
  return { width: wirePositions(frets)[frets] + 18, height: TOP + GAP * 5 + 40 };
}

export function Fretboard({ notes, frets, labelMode, leftHanded = false, showOutside = true, range, selectedChroma, onTap }: Props) {
  const wires = useMemo(() => wirePositions(frets), [frets]);
  const { width: W, height: H } = fretboardSize(frets);
  const flip = (x: number) => (leftHanded ? W - x : x);
  const noteX = (f: number) => (f === 0 ? NUT_X - 24 : (wires[f - 1] + wires[f]) / 2);
  const y = (s: number) => TOP + (5 - s) * GAP; // high e on top, like tab
  const midY = (a: number) => TOP + a * GAP;

  // The part of the board in view: from the wire before the first fret to just past the last one.
  let [left, right] = range ? [range.min <= 0 ? 0 : wires[range.min - 1] - 6, range.max >= frets ? W : wires[range.max] + 10] : [0, W];
  if (leftHanded) [left, right] = [W - right, W - left];

  const visible = notes.filter((n) => n.fret <= frets && (showOutside || n.inPosition));
  // Draw notes of the selected position last so they sit on top.
  const ordered = [...visible].sort((a, b) => Number(a.inPosition) - Number(b.inPosition));

  return (
    <div>
      <svg
        viewBox={`${left} 0 ${right - left} ${H}`}
        className="block h-auto w-full select-none"
        role="img"
        aria-label="Гриф гитары"
      >
        {/* board */}
        <rect
          x={flip(leftHanded ? wires[frets] : NUT_X)}
          y={TOP - 14}
          width={wires[frets] - NUT_X}
          height={GAP * 5 + 28}
          rx={4}
          fill="var(--fret-wood)"
        />
        {SINGLE_INLAYS.filter((f) => f <= frets).map((f) => (
          <circle key={f} cx={flip(noteX(f))} cy={midY(2.5)} r={7} fill="var(--inlay)" />
        ))}
        {DOUBLE_INLAYS.filter((f) => f <= frets).map((f) => (
          <g key={f} fill="var(--inlay)">
            <circle cx={flip(noteX(f))} cy={midY(1.5)} r={7} />
            <circle cx={flip(noteX(f))} cy={midY(3.5)} r={7} />
          </g>
        ))}
        {/* frets and nut */}
        {wires.slice(1).map((x, i) => (
          <line key={i} x1={flip(x)} x2={flip(x)} y1={TOP - 14} y2={TOP + GAP * 5 + 14} stroke="var(--fret-wire)" strokeWidth={2.5} />
        ))}
        <rect x={flip(NUT_X) - 3} y={TOP - 14} width={6} height={GAP * 5 + 28} rx={2} fill="var(--string)" />
        {/* strings */}
        {STRING_NAMES.map((name, s) => (
          <g key={s}>
            <line
              x1={flip(NUT_X - 40)}
              x2={flip(wires[frets])}
              y1={y(s)}
              y2={y(s)}
              stroke="var(--string)"
              strokeWidth={0.9 + (5 - s) * 0.38}
              opacity={0.85}
            />
            <text x={flip(9)} y={y(s) + 4} fontSize={11} fill="var(--muted)" textAnchor="middle">
              {name}
            </text>
          </g>
        ))}
        {/* fret numbers */}
        {Array.from({ length: frets }, (_, i) => i + 1).map((f) => (
          <text
            key={f}
            x={flip(noteX(f))}
            y={TOP + GAP * 5 + 34}
            fontSize={11}
            textAnchor="middle"
            fill={SINGLE_INLAYS.includes(f) || DOUBLE_INLAYS.includes(f) ? "var(--text)" : "var(--muted)"}
            opacity={SINGLE_INLAYS.includes(f) || DOUBLE_INLAYS.includes(f) ? 0.9 : 0.5}
          >
            {f}
          </text>
        ))}
        {/* notes */}
        {ordered.map((n) => {
          const text = n.inPosition ? label(n, labelMode) : "";
          const filled = n.role !== "scale";
          return (
            <g
              key={n.key}
              transform={`translate(${flip(noteX(n.fret))} ${y(n.string)})`}
              opacity={n.inPosition ? 1 : 0.2}
              onClick={() => onTap?.(n)}
              style={{ cursor: "pointer" }}
            >
              <circle r={R + 5} fill="transparent" />
              {selectedChroma === n.chroma && <circle r={R + 4} fill="none" stroke="var(--text)" strokeWidth={2} />}
              <circle
                r={R}
                fill={ROLE_FILL[n.role]}
                stroke={filled ? "none" : "var(--scale)"}
                strokeWidth={filled ? 0 : 1.6}
              />
              {text && (
                <text
                  y={text.length > 2 ? 3.5 : 4.5}
                  fontSize={text.length > 2 ? 10 : 13}
                  fontWeight={700}
                  textAnchor="middle"
                  fill={filled ? "var(--on-note)" : "var(--text)"}
                >
                  {text}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
