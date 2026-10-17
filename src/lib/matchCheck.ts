import type { AutoSyncResult, ScoreTimeline } from "./align";
import { CHROMA_FPS, fft, scoreChroma } from "./chroma";

// Does the recording fit the tab? Checked after auto-sync: the notes' pitch classes along the found mapping, compared
// with the recording as is and shifted by 1–11 semitones (another tuning, a capo, another song), the rhythm match and
// the lengths. Kept free of alphaTab and the DOM (runs in the worker).
//
// Measured on a real song with its tab (Racer X — Technical Difficulties): the right recording scores ≈1.6 on harmony,
// a part of it ≈1.55, other songs (same band, same style) 1.30–1.37; a tab moved by 1–2 semitones is found exactly.
// A shift by a fourth or a fifth (±5) can't be told from another song in a related key, so only 1–4 are named.

export interface MatchCheck {
  /** Pitch classes along the mapping, as written: 2 = best of all 12 shifts by far, 1 = average, lower = worse */
  harmony: number;
  /** The same for the best shift */
  bestHarmony: number;
  /** Semitones (−5…+6) the recording sounds above the tab at its best fit; 0 = as written */
  shift: number;
  /** Recording length ÷ the tab's length at the recording's tempo */
  lengthRatio: number;
  /** Auto-sync's rhythm confidence */
  rhythm: number;
  /** What to tell the user; empty when the recording fits */
  warnings: string[];
}

const HARMONY_OK = 1.45;
const SHIFT_MIN = 1.5;
const RHYTHM_OK = 1.3;

/** Tab ms → recording ms from the sync points (piecewise linear, extended past the ends). */
export function mappingFromPoints(timeline: ScoreTimeline, points: AutoSyncResult["points"]) {
  const knots = points
    .map((p) => ({ tab: timeline.bars.find((b) => b.bar === p.bar && b.occurrence === (p.occurrence ?? 0))?.ms, at: p.ms }))
    .filter((k): k is { tab: number; at: number } => k.tab !== undefined)
    .sort((a, b) => a.tab - b.tab);
  return (t: number) => {
    if (!knots.length) return t;
    if (knots.length === 1) return knots[0].at + t - knots[0].tab;
    let i = knots.findIndex((k) => k.tab >= t);
    if (i <= 0) i = i === 0 ? 1 : knots.length - 1;
    const a = knots[i - 1];
    const b = knots[i];
    return a.at + ((b.at - a.at) * (t - a.tab)) / (b.tab - a.tab || 1);
  };
}

const SR = 11025;
const WIN = 4096; // 2.7 Hz bins: even low E (82 Hz, 5 Hz per semitone) gets its own

/**
 * Pitch classes of the recording, CHROMA_FPS frames per second, fair to every note: each semitone from E2 to B6 counts
 * by its mean bin energy. (Auto-sync's chroma sums bins, so notes with more bins in the low range weigh more — fine for
 * comparing beats with each other, not for telling keys apart.)
 */
export function noteChroma(samples: Float32Array, sampleRate: number): Float32Array {
  const step = sampleRate / SR;
  const n = Math.floor(samples.length / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    let s = 0;
    for (let k = a; k < b && k < samples.length; k++) s += samples[k];
    x[i] = s / (b - a);
  }
  // MIDI notes 40 (E2) … 95 (B6) and the bins within half a semitone of each.
  const notes: { pc: number; from: number; to: number }[] = [];
  for (let m = 40; m <= 95; m++) {
    const f = 440 * 2 ** ((m - 69) / 12);
    const from = Math.ceil((f * 2 ** (-1 / 24) * WIN) / SR);
    const to = Math.max(from, Math.floor((f * 2 ** (1 / 24) * WIN) / SR));
    notes.push({ pc: m % 12, from, to });
  }
  const hop = SR / CHROMA_FPS;
  const frames = Math.max(0, Math.floor((n - WIN) / hop) + 1);
  const out = new Float32Array(frames * 12);
  const window = new Float32Array(WIN).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WIN));
  const re = new Float32Array(WIN);
  const im = new Float32Array(WIN);
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(f * hop);
    for (let i = 0; i < WIN; i++) {
      re[i] = (x[start + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (const note of notes) {
      let e = 0;
      for (let k = note.from; k <= note.to; k++) e += Math.hypot(re[k], im[k]);
      out[f * 12 + note.pc] += Math.log1p((100 * e) / (note.to - note.from + 1));
    }
  }
  return out;
}

/** Per-frame chroma with its mean taken out, unit length: plain loudness in every pitch class doesn't count as a match. */
function centred(v: Float32Array, o: number, out: Float64Array) {
  let m = 0;
  for (let c = 0; c < 12; c++) m += v[o + c];
  m /= 12;
  let s = 0;
  for (let c = 0; c < 12; c++) {
    out[c] = v[o + c] - m;
    s += out[c] * out[c];
  }
  s = Math.sqrt(s);
  if (s > 0) for (let c = 0; c < 12; c++) out[c] /= s;
  return s > 0;
}

export function checkMatch(timeline: ScoreTimeline, samples: Float32Array, sampleRate: number, result: AutoSyncResult): MatchCheck {
  const chroma = noteChroma(samples, sampleRate);
  const frames = chroma.length / 12;
  const map = mappingFromPoints(timeline, result.points);
  const sc = timeline.notes?.length ? scoreChroma(timeline.notes, timeline.durationMs) : null;

  // Pitch classes along the mapping, for each shift k of the recording (a tab note c heard as c + k).
  const along = new Float64Array(12);
  let counted = 0;
  const a = new Float64Array(12);
  const b = new Float64Array(12);
  if (sc)
    for (let f = 0; f * 12 < sc.length; f++) {
      if (!centred(sc, f * 12, a)) continue; // nothing pitched in the tab here
      const g = Math.round((map((f / CHROMA_FPS) * 1000) / 1000) * CHROMA_FPS);
      if (g < 0 || g >= frames || !centred(chroma, g * 12, b)) continue;
      for (let k = 0; k < 12; k++) {
        let d = 0;
        for (let c = 0; c < 12; c++) d += a[c] * b[(c + k) % 12];
        along[k] += d;
      }
      counted++;
    }

  const h = Array.from(along);
  const mean = h.reduce((s, x) => s + x, 0) / 12;
  const spread = Math.max(...h) - Math.min(...h);
  const rel = (v: number) => (counted && spread > 0 ? (v - mean) / spread + 1 : 1);
  const best = h.indexOf(Math.max(...h));
  const check = {
    harmony: +rel(h[0]).toFixed(3),
    bestHarmony: +rel(h[best]).toFixed(3),
    shift: best > 6 ? best - 12 : best,
    lengthRatio: +(samples.length / sampleRate / ((timeline.durationMs * result.scale) / 1000 || 1)).toFixed(3),
    rhythm: result.confidence,
    // Without pitched notes (a drums-only tab) or with a near-silent recording there is nothing to compare by harmony.
    warnings: [] as string[],
  };
  check.warnings = counted >= 100 ? matchWarnings(check) : matchWarnings({ ...check, harmony: HARMONY_OK, bestHarmony: HARMONY_OK, shift: 0 });
  return check;
}

const TUNING: Record<number, string> = { [-1]: "строй Eb", [-2]: "строй D", [-3]: "строй C#", [-4]: "строй C" };
const INTERVAL: Record<number, string> = { 1: "полтона", 2: "тон", 3: "полтора тона", 4: "два тона" };

/** The warnings, from the measurements (exported for tests). */
export function matchWarnings(c: Omit<MatchCheck, "warnings">): string[] {
  const out: string[] = [];
  if (c.harmony < HARMONY_OK) {
    const shift = Math.abs(c.shift);
    if (shift >= 1 && shift <= 4 && c.bestHarmony >= SHIFT_MIN) {
      const hint = c.shift < 0 ? TUNING[c.shift] : `каподастр на ${c.shift} ладу`;
      out.push(
        `Запись звучит на ${INTERVAL[shift]} ${c.shift < 0 ? "ниже" : "выше"} табов — похоже, ${hint}.` +
          (c.rhythm < RHYTHM_OK ? " Или это другая запись." : " Курсор по нотам пойдёт верно, но высота не совпадёт."),
      );
    } else out.push("Ноты табов не сходятся с записью по звучанию — похоже, это другая песня или другая версия.");
  }
  if (c.lengthRatio < 0.7) out.push("Запись заметно короче табов — возможно, в ней только часть песни.");
  else if (c.lengthRatio > 1.4) out.push("Запись заметно длиннее табов — в ней есть части, которых нет в табах.");
  return out;
}
