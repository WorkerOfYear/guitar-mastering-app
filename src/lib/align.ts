import type { SyncPoint } from "@/shared/types";

// The number crunching of auto-sync, kept free of alphaTab and the DOM so it can run in a Web Worker
// (on a laptop it takes 10–20 s, which would freeze the page).

export const FPS = 100; // envelope frames per second

export interface ScoreTimeline {
  /** Note onsets in ms at the tab's own tempo, with a weight */
  onsets: { ms: number; w: number }[];
  /** Start of each played bar (repeats included), in playback order */
  bars: { bar: number; occurrence: number; ms: number }[];
  durationMs: number;
}

// ---------- audio onsets

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Onset strength at FPS frames per second: positive log-spectral flux, locally normalised. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const size = 1024;
  const hop = sampleRate / FPS;
  const frames = Math.max(0, Math.floor((samples.length - size) / hop));
  const env = new Float32Array(frames);
  const window = new Float32Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  let prev = new Float32Array(size / 2);
  let cur = new Float32Array(size / 2);
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(f * hop);
    for (let i = 0; i < size; i++) {
      re[i] = samples[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    for (let k = 1; k < size / 2; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = cur[k] - prev[k];
      if (d > 0) flux += d;
    }
    env[f] = flux;
    [prev, cur] = [cur, prev];
  }
  // Subtract a moving average (~0.5 s) so loud and quiet parts count alike, keep the peaks.
  const out = new Float32Array(frames);
  const half = 25;
  let sum = 0;
  for (let i = 0; i < Math.min(frames, half); i++) sum += env[i];
  for (let i = 0; i < frames; i++) {
    if (i + half < frames) sum += env[i + half];
    if (i - half - 1 >= 0) sum -= env[i - half - 1];
    const count = Math.min(frames, i + half + 1) - Math.max(0, i - half);
    out[i] = Math.max(0, env[i] - sum / count);
  }
  let max = 0;
  for (const v of out) max = Math.max(max, v);
  if (max > 0) for (let i = 0; i < frames; i++) out[i] /= max;
  return out;
}

// ---------- alignment

/** Correlation of score onsets (scaled and shifted) with the audio envelope; peaks are widened by ±1 frame. */
function score_(env: Float32Array, onsets: ScoreTimeline["onsets"], offsetMs: number, scale: number, from = 0, to = onsets.length, fps = FPS) {
  let s = 0;
  for (let i = from; i < to; i++) {
    const f = Math.round(((offsetMs + onsets[i].ms * scale) / 1000) * fps);
    if (f < 1 || f >= env.length - 1) continue;
    s += onsets[i].w * Math.max(env[f], 0.6 * env[f - 1], 0.6 * env[f + 1]);
  }
  return s;
}

/** Max-pool the envelope by `factor` frames. */
function downsample(env: Float32Array, factor: number) {
  const out = new Float32Array(Math.ceil(env.length / factor));
  for (let i = 0; i < env.length; i++) out[(i / factor) | 0] = Math.max(out[(i / factor) | 0], env[i]);
  return out;
}

/** The `n` heaviest onsets (drum hits, chords), in time order. */
function strongest(onsets: ScoreTimeline["onsets"], n: number) {
  if (onsets.length <= n) return onsets;
  const cut = [...onsets].sort((a, b) => b.w - a.w)[n - 1].w;
  return onsets.filter((o) => o.w >= cut).slice(0, n * 2);
}

export interface AutoSyncResult {
  points: SyncPoint[];
  /** Where bar 1 starts in the recording */
  bar1Ms: number | null;
  /** The tab repeats a part the recording plays once */
  skippedRepeat: boolean;
  /** Bars closing such repeats: play them once when following the recording */
  unrepeat: number[];
  offsetMs: number;
  scale: number;
  /** How much the best match stands out (≥ 1.5 is a confident match) */
  confidence: number;
}

/**
 * Align the tab with the recording. `anchors` are bars to place sync points at (e.g. section starts);
 * by default every 4 bars.
 */
export function align(timeline: ScoreTimeline, env: Float32Array, anchors?: number[]): AutoSyncResult {
  const { onsets, bars } = timeline;
  const audioMs = (env.length / FPS) * 1000;

  // 1. Global: offset of bar 1 and tempo factor. Coarse pass on a 50 ms envelope with the strongest
  //    onsets only, then a fine pass at full resolution around the winner.
  const coarseEnv = downsample(env, 5);
  const strong = strongest(onsets, 1500);
  const coarse = (offset: number, scale: number) => score_(coarseEnv, strong, offset, scale, 0, strong.length, FPS / 5);
  const lags: number[] = [];
  const candidates: { offset: number; scale: number; s: number }[] = [];
  const maxOffset = Math.min(60_000, Math.max(0, audioMs - timeline.durationMs * 0.5));
  for (let scale = 0.9; scale <= 1.1001; scale += 0.005) {
    for (let offset = -10_000; offset <= maxOffset; offset += 50) {
      const s = coarse(offset, scale);
      if (Math.abs(scale - 1) < 0.003) lags.push(s);
      candidates.push({ offset, scale, s });
    }
  }
  // Steady hi-hats make neighbouring eighth notes look alike at 50 ms, so refine several
  // distinct candidates at full resolution with every onset, and keep the best.
  candidates.sort((a, b) => b.s - a.s);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= 20) break;
    // distinct offsets only: tempo variants of one offset would otherwise fill the list
    if (picked.every((p) => Math.abs(p.offset - c.offset) > 100)) picked.push(c);
  }
  let best = { offset: 0, scale: 1, s: -1 };
  for (const c of picked) {
    for (let scale = c.scale - 0.004; scale <= c.scale + 0.004; scale += 0.001) {
      for (let offset = c.offset - 60; offset <= c.offset + 60; offset += 5) {
        const s = score_(env, onsets, offset, scale);
        if (s > best.s) best = { offset, scale, s };
      }
    }
  }
  const coarseBest = coarse(best.offset, best.scale);
  const mean = lags.reduce((a, b) => a + b, 0) / Math.max(1, lags.length);
  const confidence = mean > 0 ? coarseBest / mean : 0;

  // 2. Local: refine each anchor bar near where the global fit (plus the drift so far) puts it.
  //    Music repeats every beat, so the window is narrow and far shifts are penalised.
  const first = (bar: number) => bars.find((b) => b.bar === bar && b.occurrence === 0);
  const anchorBars = (anchors?.length ? anchors : bars.filter((b) => b.occurrence === 0 && (b.bar - 1) % 4 === 0).map((b) => b.bar))
    .filter((b, i, all) => all.indexOf(b) === i && first(b))
    .sort((a, b) => a - b);
  if (!anchorBars.includes(1) && first(1)) anchorBars.unshift(1);

  // Each segment gives the correction that fits it best; it describes the segment's middle,
  // so bar starts get the correction interpolated between neighbouring middles.
  const estimates: { mid: number; corr: number }[] = [];
  const lastBar = Math.max(...bars.map((b) => b.bar));
  let drift = 0; // predicted correction for the current segment
  for (let i = 0; i < anchorBars.length; i++) {
    const startMs = first(anchorBars[i])!.ms;
    const nextBar = anchorBars[i + 1];
    const endMs = nextBar ? first(nextBar)!.ms : timeline.durationMs;
    const from = onsets.findIndex((o) => o.ms >= startMs);
    const to = onsets.findIndex((o) => o.ms >= endMs);
    if (from < 0) break;
    const end = to < 0 ? onsets.length : to;
    if (end - from < 10) continue; // too few notes to tell (a final chord, a long rest)
    if ((nextBar ?? lastBar + 1) - anchorBars[i] < 3) continue; // a short tail (the ending) is too ambiguous
    // Predict this segment's correction from the trend of the last two (a band drifts gradually).
    const mid = (onsets[from].ms + onsets[end - 1].ms) / 2;
    const [p1, p2] = estimates.slice(-2);
    const trend = p1 && p2 ? Math.max(-80, Math.min(80, ((p2.corr - p1.corr) * (mid - p2.mid)) / (p2.mid - p1.mid || 1))) : 0;
    drift = (p2?.corr ?? 0) + trend;
    let local = { d: 0, s: -1 };
    const scores: number[] = [];
    // Over 4 bars a band rarely drifts more than ~100 ms; a wider window would lock onto the next 16th.
    for (let d = -200; d <= 200; d += 10) {
      const raw = score_(env, onsets, best.offset + drift + d, best.scale, from, end);
      scores.push(raw);
      const s = raw * Math.exp(-0.5 * (d / 120) ** 2);
      if (s > local.s) local = { d, s };
    }
    const m = scores.reduce((a, b) => a + b, 0) / scores.length;
    const peak = scores[(local.d + 200) / 10];
    if (m > 0 && peak / m < 1.05) continue; // no clear match here (silence, solo with no drums…)
    estimates.push({ mid, corr: drift + local.d });
  }
  const corrAt = (t: number) => {
    if (!estimates.length) return 0;
    if (estimates.length === 1) return estimates[0].corr;
    let i = estimates.findIndex((e) => e.mid >= t);
    if (i <= 0) i = i === 0 ? 1 : estimates.length - 1; // extrapolate from the nearest pair
    const a = estimates[i - 1];
    const b = estimates[i];
    return a.corr + ((b.corr - a.corr) * (t - a.mid)) / (b.mid - a.mid || 1);
  };
  // Where every played bar (repeats included) lands in the recording.
  const mapped = bars.map((b) => ({ ...b, at: best.offset + b.ms * best.scale + corrAt(b.ms) }));

  // A repeat the recording doesn't play (the intro once instead of twice) shows up as bars before 0:00.
  // Then the first pass gets the recording's times, the pass it lacks is dropped, and the repeat is
  // switched off for playback with the recording (`unrepeat`), so the notes follow the band's order.
  const lead = mapped.findIndex((b) => b.at >= -50);
  let played = mapped;
  let keep = 0; // leading entries that must get a mark (the first pass and the bar after it)
  const unrepeat: number[] = [];
  if (lead > 0) {
    const pass = mapped.slice(0, lead);
    const again = mapped.slice(lead, lead * 2);
    if (again.length === lead && again.every((b, i) => b.bar === pass[i].bar)) {
      pass.forEach((b, i) => (b.at = again[i].at));
      played = [...pass, ...mapped.slice(lead * 2)];
      keep = lead + 1;
      unrepeat.push(pass[lead - 1].bar);
    }
  }

  const isAnchor = new Set(anchorBars);
  const points: SyncPoint[] = [];
  played.forEach((b, i) => {
    if (i >= keep && !isAnchor.has(b.bar)) return;
    const ms = Math.round(b.at);
    if (ms < 0 || ms >= audioMs || (points.length && ms <= points[points.length - 1].ms)) return;
    points.push(b.occurrence ? { bar: b.bar, occurrence: b.occurrence, ms } : { bar: b.bar, ms });
  });
  const bar1 = points.find((p) => p.bar === 1 && !p.occurrence);
  return {
    points,
    bar1Ms: bar1?.ms ?? null,
    skippedRepeat: unrepeat.length > 0,
    unrepeat,
    offsetMs: Math.round(best.offset),
    scale: +best.scale.toFixed(3),
    confidence: +confidence.toFixed(2),
  };
}

