import { useState } from "react";
import { formatDay } from "@/lib/date";
import type { TempoEntry } from "@/shared/types";

interface Props {
  entries: TempoEntry[];
  target?: number | null;
}

const W = 340;
const H = 150;
const PAD = { l: 34, r: 12, t: 14, b: 22 };

/** Best clean tempo per day as a line, with the target as a dashed reference. Tap a point for its value. */
export function TempoChart({ entries, target }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const byDay = new Map<string, number>();
  for (const e of entries) if (e.result === "clean" && e.bpm) byDay.set(e.date, Math.max(byDay.get(e.date) ?? 0, e.bpm));
  const points = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (points.length === 0) return <p className="py-4 text-center text-sm text-muted">Пока нет чистых результатов с темпом</p>;

  const values = points.map(([, v]) => v);
  const lo = Math.floor((Math.min(...values, target ?? Infinity) - 5) / 10) * 10;
  const hi = Math.ceil((Math.max(...values, target ?? -Infinity) + 5) / 10) * 10;
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = points.map(([, v], i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const sel = picked !== null ? points[picked] : points[points.length - 1];
  const selIndex = picked ?? points.length - 1;

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 text-sm">
        <span className="text-muted">{formatDay(sel[0])}</span>
        <span>
          <b className="text-lg tabular-nums">{sel[1]}</b> <span className="text-muted">bpm чисто</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="График чистого темпа по дням">
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 4} fontSize={10} textAnchor="end" fill="var(--muted)">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {target && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" />
            <text x={W - PAD.r} y={y(target) - 5} fontSize={10} textAnchor="end" fill="var(--muted)">
              цель {target}
            </text>
          </g>
        )}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map(([day, v], i) => (
          <g key={day} onClick={() => setPicked(i)} style={{ cursor: "pointer" }}>
            <circle cx={x(i)} cy={y(v)} r={14} fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r={i === selIndex ? 5.5 : 4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize={10} fill="var(--muted)">
          {formatDay(points[0][0])}
        </text>
        {points.length > 1 && (
          <text x={W - PAD.r} y={H - 6} fontSize={10} textAnchor="end" fill="var(--muted)">
            {formatDay(points[points.length - 1][0])}
          </text>
        )}
      </svg>
    </div>
  );
}
