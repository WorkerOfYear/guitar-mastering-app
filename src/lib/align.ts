import type { SyncPoint } from "@/shared/types";
import { CHROMA_FPS, scoreChroma, type ScoreNote } from "./chroma";
import { refineBars } from "./beats";
import type { MatchCheck } from "./matchCheck";

// The number crunching of auto-sync, kept free of alphaTab and the DOM so it can run in a Web Worker
// (on a laptop it takes 10–20 s, which would freeze the page).

export const FPS = 100; // envelope frames per second
const HEAD_MS = 60_000; // the start of the song, matched on its own as well

export interface ScoreTimeline {
  /** Note onsets in ms at the tab's own tempo, with a weight */
  onsets: { ms: number; w: number }[];
  /** Start of each played bar (repeats included), in playback order */
  bars: { bar: number; occurrence: number; ms: number }[];
  /** Every beat (tab ms, playback order), for the beat-by-beat refinement (beats.ts) */
  beats?: number[];
  /** Pitched notes, to compare by harmony (chroma.ts) */
  notes?: ScoreNote[];
  /** Bars where the tab changes tempo: a recording may not change there, or by another amount */
  tempoBars?: number[];
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
  /** Whether the recording fits the tab (matchCheck.ts; added by the worker) */
  check?: MatchCheck;
}

/**
 * Align the tab with the recording. `anchors` are bars to place sync points at (e.g. section starts);
 * by default every 4 bars.
 */
export function align(timeline: ScoreTimeline, env: Float32Array, anchors?: number[], chroma?: Float32Array): AutoSyncResult {
  const { onsets, bars } = timeline;
  const audioMs = (env.length / FPS) * 1000;

  // 1. Global: offset of bar 1 and tempo factor. Coarse pass on a 50 ms envelope with the strongest
  //    onsets only, then a fine pass at full resolution around each of the best candidates.
  const coarseEnv = downsample(env, 5);
  const strong = strongest(onsets, 1500);
  const coarse = (offset: number, scale: number) => score_(coarseEnv, strong, offset, scale, 0, strong.length, FPS / 5);
  // The same on the first minute only: if the recording later changes tempo differently from the tab,
  // the whole song pulls the fit away from the right start, the beginning alone doesn't.
  const head = onsets.filter((o) => o.ms < HEAD_MS);
  const strongHead = strongest(head, 600);
  const lags: number[] = [];
  const candidates: { offset: number; scale: number; s: number; h: number }[] = [];
  const maxOffset = Math.min(60_000, Math.max(0, audioMs - timeline.durationMs * 0.5));
  for (let scale = 0.9; scale <= 1.1001; scale += 0.005) {
    for (let offset = -10_000; offset <= maxOffset; offset += 50) {
      const s = coarse(offset, scale);
      if (Math.abs(scale - 1) < 0.003) lags.push(s);
      candidates.push({ offset, scale, s, h: score_(coarseEnv, strongHead, offset, scale, 0, strongHead.length, FPS / 5) });
    }
  }
  // Steady hi-hats make neighbouring eighth notes look alike at 50 ms, so refine several
  // distinct candidates at full resolution, and let step 2 pick among them.
  candidates.sort((a, b) => b.s - a.s);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= 20) break;
    // distinct offsets only: tempo variants of one offset would otherwise fill the list
    if (picked.every((p) => Math.abs(p.offset - c.offset) > 100)) picked.push(c);
  }
  const refined = picked.map((c) => {
    let r = { offset: c.offset, scale: c.scale, s: -1 };
    for (let scale = c.scale - 0.004; scale <= c.scale + 0.004; scale += 0.001) {
      for (let offset = c.offset - 60; offset <= c.offset + 60; offset += 5) {
        const s = score_(env, onsets, offset, scale);
        if (s > r.s) r = { offset, scale, s };
      }
    }
    return r;
  });
  // The start of the song alone, at full resolution (a minute of notes is cheap to scan): with a repeated
  // riff the coarse pass can't tell a 16th apart, and later tempo changes pull the whole-song fit away.
  if (head.length < onsets.length) {
    const scales = [...new Set([...candidates].sort((a, b) => b.h - a.h).slice(0, 3).map((c) => c.scale))];
    const fine: { offset: number; scale: number; s: number }[] = [];
    for (const scale of scales) for (let offset = -10_000; offset <= maxOffset; offset += 10) fine.push({ offset, scale, s: score_(env, head, offset, scale) });
    let added = 0;
    for (const c of fine.sort((a, b) => b.s - a.s)) {
      if (added >= 10) break;
      if (refined.every((r) => Math.abs(r.offset - c.offset) > 30)) {
        refined.push(c);
        added++;
      }
    }
  }

  // 2. Follow the recording segment by segment (from anchor bar to anchor bar). Each segment starts where
  //    the previous one ended in the recording and gets a tempo of its own, so a band that speeds up, slows
  //    down or plays a tempo change differently from the tab (130 → 120 in the tab, steady in the recording)
  //    is followed instead of drifting away by a beat per bar. The start may still shift a little (±200 ms),
  //    the tempo may change a little from the previous segment; both are penalised so the fit stays on
  //    the band's beat instead of jumping to the next 16th.
  const first = (bar: number) => bars.find((b) => b.bar === bar && b.occurrence === 0);
  const tempoBars = new Set(timeline.tempoBars ?? []);
  const anchorBars = [...(anchors?.length ? anchors : bars.filter((b) => b.occurrence === 0 && (b.bar - 1) % 4 === 0).map((b) => b.bar)), ...tempoBars]
    .filter((b, i, all) => all.indexOf(b) === i && first(b))
    .sort((a, b) => a - b);
  if (!anchorBars.includes(1) && first(1)) anchorBars.unshift(1);

  const lastBar = Math.max(...bars.map((b) => b.bar));
  // Tab time → recording time at segment boundaries (knots); between them the mapping is linear.
  // `total` is how well all the notes then meet the recording, to pick the best start.
  const follow = (start: { offset: number; scale: number }) => {
    const knots: { tab: number; at: number }[] = [];
    let total = 0;
    let rate = start.scale;
    let pos = start.offset + (anchorBars.length ? first(anchorBars[0])!.ms : 0) * start.scale;
    // Where the tab changes tempo the recording may jump to another tempo. Until a segment after the change
    // matches clearly (the bars right after it may be a rest), the tempo stays open and is fitted from the
    // change on, over everything since: `span` is where that started.
    let span: { tab: number; at: number; knot: number } | null = null;
    for (let i = 0; i < anchorBars.length; i++) {
      const startMs = first(anchorBars[i])!.ms;
      const nextBar = anchorBars[i + 1];
      const endMs = nextBar ? first(nextBar)!.ms : timeline.durationMs;
      const from = onsets.findIndex((o) => o.ms >= startMs);
      const to = onsets.findIndex((o) => o.ms >= endMs);
      const end = to < 0 ? onsets.length : to;
      if (tempoBars.has(anchorBars[i]) && !span) span = { tab: startMs, at: pos, knot: knots.length };
      const open = span;
      const base = (r: number) => (open ? open.at + (startMs - open.tab) * r : pos); // segment start at tempo r
      let fit = { d: 0, r: rate };
      let got = from >= 0 ? score_(env, onsets, pos - startMs * rate, rate, from, end) : 0;
      // Too few notes to tell (a final chord, a long rest) or a short ambiguous tail: carry on at the same tempo.
      if (from >= 0 && end - from >= 10 && (nextBar ?? lastBar + 1) - anchorBars[i] >= 3) {
        let bestS = -1;
        let sum = 0;
        let n = 0;
        let top = 0;
        // A drifting band changes tempo a little from segment to segment; after a tempo change anything within
        // ±15 %, the nearer the likelier (far tempos can line 16ths up with triplets by accident).
        const steps = open ? 38 : 20;
        const at = (k: number, d: number) => {
          const r = rate * (1 + k * 0.004);
          if (r < start.scale * 0.8 || r > start.scale * 1.25) return -1;
          const raw = score_(env, onsets, base(r) + d - startMs * r, r, from, end);
          const keep = open ? Math.exp(-0.5 * ((k * 0.004) / 0.15) ** 2) : Math.exp(-0.5 * (k / 8) ** 2);
          const s = raw * Math.exp(-0.5 * (d / 120) ** 2) * keep;
          if (s > bestS) {
            bestS = s;
            top = raw;
            fit = { d, r };
          }
          return raw;
        };
        // Coarse grid (tempo in 0.8 % steps, start in 20 ms), then its neighbours around the best.
        for (let k = -steps; k <= steps; k += 2) {
          for (let d = -200; d <= 200; d += 20) {
            const raw = at(k, d);
            if (raw >= 0) {
              sum += raw;
              n++;
            }
          }
        }
        const k0 = Math.round((fit.r / rate - 1) / 0.004);
        const d0 = fit.d;
        for (let k = k0 - 1; k <= k0 + 1; k++) for (let d = d0 - 10; d <= d0 + 10; d += 10) if (Math.abs(d) <= 200) at(k, d);
        if (sum > 0 && top / (sum / n) >= 1.05) {
          got = top;
          if (open) {
            // The new tempo holds since the change: redo the marks placed while it was open.
            for (let j = open.knot; j < knots.length; j++) knots[j].at = open.at + fit.d + (knots[j].tab - open.tab) * fit.r;
            pos = base(fit.r);
            span = null;
          }
        } else fit = { d: 0, r: rate }; // no clear match (silence, a solo with no drums…)
      }
      total += got;
      pos += fit.d;
      rate = fit.r;
      knots.push({ tab: startMs, at: pos });
      pos += (endMs - startMs) * rate;
    }
    if (anchorBars.length) knots.push({ tab: timeline.durationMs, at: pos });
    return { ...start, knots, total };
  };
  // The best global fit can be off by a beat when the recording changes tempo differently from the tab
  // (the notes after the change pull it away from the start), so follow from each candidate and keep
  // the one where the whole song matches best.
  const best = refined.map(follow).reduce((a, b) => (b.total > a.total ? b : a));
  const knots = best.knots;
  const mean = lags.reduce((a, b) => a + b, 0) / Math.max(1, lags.length);
  const confidence = mean > 0 ? coarse(best.offset, best.scale) / mean : 0;
  const mapAt = (t: number) => {
    if (knots.length < 2) return best.offset + t * best.scale;
    let i = knots.findIndex((k) => k.tab >= t);
    if (i <= 0) i = i === 0 ? 1 : knots.length - 1; // before bar 1 or past the end: extend the nearest segment
    const a = knots[i - 1];
    const b = knots[i];
    return a.at + ((b.at - a.at) * (t - a.tab)) / (b.tab - a.tab || 1);
  };
  // Where every played bar (repeats included) lands in the recording.
  const mapped = bars.map((b) => ({ ...b, at: mapAt(b.ms) }));

  // 3. Beat by beat (beats.ts): the recording's beats are found and paired with the tab's, by rhythm and
  //    harmony, around the mapping above. A tempo model can't follow a band that plays a solo a couple of
  //    bars shorter than the tab; this does, and gives every bar its own mark.
  const byBeat = refineBars(timeline, env, FPS, mapAt, chroma);
  // Kept only when the notes then meet the recording clearly better (by 5 %, attacks and harmony together)
  // than with the mapping above: a recording with no steady pulse can throw the beat tracking off, and a
  // near tie isn't worth it. Harmony matters: on a steady beat a section two bars off looks just as good by
  // attacks alone.
  const fit = (at: (k: number) => number) => {
    let s = 0;
    for (let k = 0; k + 1 < bars.length; k++) {
      const a = bars[k];
      const b = bars[k + 1];
      const from = onsets.findIndex((o) => o.ms >= a.ms);
      const to = onsets.findIndex((o) => o.ms >= b.ms);
      if (from < 0 || b.ms <= a.ms) continue;
      const r = (at(k + 1) - at(k)) / (b.ms - a.ms);
      s += score_(env, onsets, at(k) - a.ms * r, r, from, to < 0 ? onsets.length : to);
    }
    return s;
  };
  const before = fit((k) => mapped[k].at);
  const after = byBeat.every((t) => Number.isFinite(t)) ? fit((k) => byBeat[k]) : -1;
  // And by harmony: how alike the tab's and the recording's pitch classes are along each mapping.
  const sc = chroma && timeline.notes?.length ? scoreChroma(timeline.notes, timeline.durationMs) : null;
  const harmony = (at: (k: number) => number) => {
    if (!sc || !chroma) return 1;
    let s = 0;
    let n = 0;
    for (let k = 0; k + 1 < bars.length; k++) {
      const a = bars[k];
      const b = bars[k + 1];
      for (let t = a.ms; t < b.ms; t += 1000 / CHROMA_FPS) {
        const f = Math.round((t / 1000) * CHROMA_FPS);
        const g = Math.round(((at(k) + ((at(k + 1) - at(k)) * (t - a.ms)) / (b.ms - a.ms)) / 1000) * CHROMA_FPS);
        if (f < 0 || f * 12 >= sc.length || g < 0 || g * 12 >= chroma.length) continue;
        let d = 0;
        let e = 0;
        for (let c = 0; c < 12; c++) {
          d += sc[f * 12 + c] * chroma[g * 12 + c];
          e += sc[f * 12 + c];
        }
        if (e === 0) continue; // nothing pitched in the tab here (drums only, a rest)
        s += d;
        n++;
      }
    }
    return n ? s / n : 1;
  };
  const hBefore = harmony((k) => mapped[k].at);
  const hAfter = after >= 0 ? harmony((k) => byBeat[k]) : 0;
  const beatByBeat = after > 0 && (after / before) * (hAfter / hBefore) > 1.05;
  if (beatByBeat) mapped.forEach((b, k) => (b.at = byBeat[k]));

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
    if (i >= keep && !beatByBeat && !isAnchor.has(b.bar)) return;
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

