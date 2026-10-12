// Beat by beat: where every beat falls in the recording (Ellis, "Beat tracking by dynamic programming", 2007),
// then which tab beat each one is (DTW over the beats). The beat period comes from the onset envelope's
// autocorrelation around the tab's own tempo, so the band may drift as it likes; the pairing by rhythm and
// harmony lets a section be shorter or longer than the tab. Kept free of alphaTab and the DOM (worker).
import type { ScoreTimeline } from "./align";
import { scoreChroma, spanChroma } from "./chroma";

/** Onset envelope divided by its local maximum (±1 s): a quiet verse counts as much as a loud chorus. */
export function localNormalise(env: Float32Array, fps: number) {
  const half = fps;
  const out = new Float32Array(env.length);
  // sliding max with a monotonic deque
  const q: number[] = [];
  let head = 0;
  for (let i = 0, j = 0; i < env.length; i++) {
    for (; j < Math.min(env.length, i + half + 1); j++) {
      while (q.length > head && env[q[q.length - 1]] <= env[j]) q.pop();
      q.push(j);
    }
    while (q[head] < i - half) head++;
    const m = env[q[head]];
    out[i] = m > 0 ? env[i] / m : 0;
  }
  return out;
}

/**
 * Beat period (in frames) over time, from the autocorrelation of 8 s windows, searched within -15…+18 % of
 * `expected` (the tab's beat at its tempo) so the band's beat isn't confused with half or double time.
 */
export function beatPeriods(env: Float32Array, fps: number, expected: (frame: number) => number) {
  const win = 8 * fps;
  const step = fps;
  const centres: number[] = [];
  const periods: number[] = [];
  for (let a = 0; a + win <= env.length; a += step) {
    const p0 = expected(a + win / 2);
    let best = { lag: p0, v: -1 };
    const corr = (lag: number) => {
      let v = 0;
      for (let i = a; i + lag < a + win; i++) v += env[i] * env[i + lag];
      return v / (win - lag);
    };
    for (let lag = Math.floor(p0 * 0.85); lag <= Math.ceil(p0 * 1.18); lag++) {
      const v = corr(lag);
      if (v > best.v) best = { lag, v };
    }
    const y0 = corr(best.lag - 1);
    const y2 = corr(best.lag + 1);
    const den = y0 - 2 * best.v + y2;
    centres.push(a + win / 2);
    periods.push(best.lag + (den < 0 ? (0.5 * (y0 - y2)) / den : 0));
  }
  // Smooth over neighbours (median of 5): one window locking on a fill shouldn't bend the pulse.
  const smooth = periods.map((_, i) => {
    const w = periods.slice(Math.max(0, i - 2), i + 3).sort((x, y) => x - y);
    return w[w.length >> 1];
  });
  return (frame: number) => {
    if (!centres.length) return expected(frame);
    let i = centres.findIndex((c) => c >= frame);
    if (i < 0) return smooth[smooth.length - 1];
    if (i === 0) return smooth[0];
    const t = (frame - centres[i - 1]) / (centres[i] - centres[i - 1]);
    return smooth[i - 1] + t * (smooth[i] - smooth[i - 1]);
  };
}

/** Beat times (frames) by dynamic programming: attacks on the beat, intervals close to the local period. */
export function trackBeats(env: Float32Array, period: (frame: number) => number, tightness = 100) {
  const n = env.length;
  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const p = period(t);
    let best = 0;
    let arg = -1;
    for (let tau = Math.round(p * 0.7); tau <= Math.round(p * 1.4); tau++) {
      const s = t - tau;
      if (s < 0) break;
      const v = score[s] - tightness * Math.log(tau / p) ** 2;
      if (arg < 0 || v > best) {
        best = v;
        arg = s;
      }
    }
    score[t] = env[t] + (arg >= 0 ? Math.max(0, best) : 0);
    back[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  // End on the best-scoring frame within the last beat.
  let t = n - 1;
  const last = Math.round(period(n - 1));
  for (let k = n - 1; k >= Math.max(0, n - last); k--) if (score[k] > score[t]) t = k;
  const beats: number[] = [];
  while (t >= 0) {
    beats.push(t);
    t = back[t];
  }
  return beats.reverse();
}

/**
 * Pairs the tab's grid with the recording's (DTW): both are eighth-note grids (beats and the points halfway),
 * so whether the recording's tracked beats fell on the beat or on the "and" is just one step for the path.
 * Each grid point is compared by the beat that starts there: its attacks on eight slots (32nds) and, when
 * given, the pitch classes sounding over it. A point one side has and the
 * other hasn't costs a penalty instead of throwing the rest off. `guide` (tab ms → recording ms) keeps the
 * search within ±12 beats of a rough alignment. Returns the recording time (ms) per tab grid point, NaN
 * where it couldn't be placed.
 */
export function alignGrid(opts: {
  tabGrid: number[]; // tab ms, playback order
  tabOnsets: { ms: number; w: number }[];
  recGrid: number[]; // frames of `env`
  env: Float32Array; // locally normalised onset envelope
  fps: number;
  guide: (tabMs: number) => number;
  /** Mean chroma (12 values, unit length) over the beat starting at each grid point */
  tabChroma?: Float32Array;
  recChroma?: Float32Array;
}): Float64Array {
  const { tabGrid, tabOnsets, recGrid, env, fps, guide, tabChroma, recChroma } = opts;
  const N = tabGrid.length;
  const M = recGrid.length;
  const out = new Float64Array(N).fill(NaN);
  if (N < 4 || M < 4) return out;
  const S = 8; // slots over the two grid steps (one beat) after a point
  const step = (g: number[], i: number) => (i + 1 < g.length ? g[i + 1] - g[i] : g[g.length - 1] - g[g.length - 2]);
  const at = (g: number[], i: number) => (i < g.length ? g[i] : g[g.length - 1] + (i - g.length + 1) * step(g, g.length - 1));
  /** Position of slot s (0…7) in the beat starting at grid point i. */
  const slotPos = (g: number[], i: number, s: number) => {
    const k = i + (s >> 2);
    return at(g, k) + ((at(g, k + 1) - at(g, k)) * (s & 3)) / 4;
  };

  const tabPat = new Float32Array(N * S);
  let oi = 0;
  for (let i = 0; i < N; i++) {
    const a = at(tabGrid, i);
    const b = at(tabGrid, i + 2);
    while (oi < tabOnsets.length && tabOnsets[oi].ms < a - 1) oi++;
    for (let k = oi; k < tabOnsets.length && tabOnsets[k].ms < b - 1; k++) {
      const ms = tabOnsets[k].ms;
      const half = ms < at(tabGrid, i + 1) ? 0 : 1;
      const from = at(tabGrid, i + half);
      const slot = half * 4 + Math.round((4 * (ms - from)) / (at(tabGrid, i + half + 1) - from || 1));
      tabPat[i * S + Math.min(S - 1, Math.max(0, slot))] += tabOnsets[k].w;
    }
    unit(tabPat, i * S, S);
  }
  const recPat = new Float32Array(M * S);
  for (let j = 0; j < M; j++) {
    for (let s = 0; s < S; s++) {
      const c = Math.round(slotPos(recGrid, j, s));
      let m = 0;
      for (let f = c - 2; f <= c + 2; f++) m = Math.max(m, env[f] ?? 0);
      recPat[j * S + s] = m;
    }
    unit(recPat, j * S, S);
  }
  const dot = (x: Float32Array, i: number, y: Float32Array, j: number, n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++) v += x[i * n + k] * y[j * n + k];
    return v;
  };
  const cost = (i: number, j: number) => {
    let c = 1 - dot(tabPat, i, recPat, j, S);
    if (tabChroma && recChroma) c += 1 - dot(tabChroma, i, recChroma, j, 12);
    return c;
  };

  // Band: around the recording grid point nearest to where the rough alignment puts each tab point.
  const R = 24;
  const W = 2 * R + 1;
  const centre = new Int32Array(N);
  for (let i = 0, j = 0; i < N; i++) {
    const t = (guide(tabGrid[i]) / 1000) * fps;
    while (j + 1 < M && Math.abs(recGrid[j + 1] - t) <= Math.abs(recGrid[j] - t)) j++;
    while (j > 0 && Math.abs(recGrid[j - 1] - t) < Math.abs(recGrid[j] - t)) j--;
    centre[i] = j;
  }
  const idx = (i: number, j: number) => {
    const k = j - centre[i] + R;
    return k >= 0 && k < W ? i * W + k : -1;
  };
  const SKIP = 0.6; // a grid point one side has and the other hasn't
  const OPEN = 32; // the first/last points of the tab may be missing from the recording (a repeat played once)
  const INF = 1e30;
  const D = new Float64Array(N * W).fill(INF);
  const from = new Uint8Array(N * W); // 1 diagonal, 2 tab point skipped (from i-1), 3 recording point skipped (from j-1)
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < W; k++) {
      const j = centre[i] - R + k;
      if (j < 0 || j >= M) continue;
      const c = cost(i, j);
      let best = i < OPEN ? 0.15 * i : INF; // open start: leading tab points may be skipped cheaply
      let dir = 0;
      const d = i > 0 ? idx(i - 1, j - 1) : -1;
      if (d >= 0 && D[d] < best) [best, dir] = [D[d], 1];
      const u = i > 0 ? idx(i - 1, j) : -1;
      if (u >= 0 && D[u] + SKIP < best) [best, dir] = [D[u] + SKIP, 2];
      const l = idx(i, j - 1);
      if (l >= 0 && D[l] + SKIP < best) [best, dir] = [D[l] + SKIP, 3];
      D[i * W + k] = best + c;
      from[i * W + k] = dir;
    }
  }
  // Open end: the path may stop a little before the tab's last point.
  let end = -1;
  let endCost = INF;
  for (let i = Math.max(0, N - OPEN); i < N; i++)
    for (let k = 0; k < W; k++) {
      const v = D[i * W + k] + 0.15 * (N - 1 - i);
      if (v < endCost) [endCost, end] = [v, i * W + k];
    }
  if (end < 0) return out;
  let i = Math.floor(end / W);
  let j = centre[i] - R + (end % W);
  for (;;) {
    const dir = from[i * W + (j - centre[i] + R)];
    if (dir !== 2) out[i] = (recGrid[j] / fps) * 1000; // a skipped tab point keeps NaN (interpolated later)
    if (dir === 1) [i, j] = [i - 1, j - 1];
    else if (dir === 2) i -= 1;
    else if (dir === 3) j -= 1;
    else break;
    if (i < 0) break;
  }
  return out;
}

function unit(v: Float32Array, o: number, n: number) {
  let s = 0;
  for (let k = 0; k < n; k++) s += v[o + k] * v[o + k];
  s = Math.sqrt(s);
  if (s > 0) for (let k = 0; k < n; k++) v[o + k] /= s;
}

/**
 * The whole beat-by-beat refinement: find the recording's beats, pair them with the tab's (rhythm and
 * harmony), and give each played bar of `timeline.bars` its time in the recording (NaN where unknown).
 * `guide` is the rough mapping (tab ms → recording ms) it searches around; `chroma` the recording's chroma.
 */
export function refineBars(timeline: ScoreTimeline, rawEnv: Float32Array, fps: number, guide: (tabMs: number) => number, chroma?: Float32Array) {
  const tabBeats = timeline.beats ?? [];
  const times = new Float64Array(timeline.bars.length).fill(NaN);
  if (tabBeats.length < 8) return times;
  const env = localNormalise(rawEnv, fps);

  // Expected beat length at a recording frame: the tab's beat where the guide puts that moment.
  const inverse = (ms: number) => {
    let lo = -60_000;
    let hi = timeline.durationMs + 60_000;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (guide(mid) < ms) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const beatLen = (tabMs: number) => {
    let i = tabBeats.findIndex((b) => b > tabMs);
    if (i < 0) i = tabBeats.length - 1;
    if (i === 0) i = 1;
    return tabBeats[i] - tabBeats[i - 1];
  };
  const scale = (tabMs: number) => (guide(tabMs + 1000) - guide(tabMs)) / 1000;
  const period = beatPeriods(env, fps, (f) => {
    const t = inverse((f / fps) * 1000);
    return (beatLen(t) * scale(t) * fps) / 1000;
  });
  const recBeats = trackBeats(env, period);
  // Eighth-note grids: beats and the points halfway between them.
  const halves = (g: number[]) => g.flatMap((x, i) => (i + 1 < g.length ? [x, (x + g[i + 1]) / 2] : [x]));
  const tabGrid = halves(tabBeats);
  const recGrid = halves(recBeats);

  let tabChroma: Float32Array | undefined;
  let recChroma: Float32Array | undefined;
  if (chroma && timeline.notes?.length) {
    const beatSpans = (g: number[]) => g.map((x, i): [number, number] => [x, g[i + 2] ?? x + 2 * ((g[i + 1] ?? x) - (g[i - 1] ?? x))]);
    tabChroma = spanChroma(scoreChroma(timeline.notes, timeline.durationMs), beatSpans(tabGrid));
    recChroma = spanChroma(chroma, beatSpans(recGrid.map((f) => (f / fps) * 1000)));
  }
  const grid = alignGrid({ tabGrid, tabOnsets: timeline.onsets, recGrid, env, fps, guide, tabChroma, recChroma });
  const at = tabBeats.map((_, i) => grid[2 * i]);

  // Beats the pairing skipped: between placed neighbours proportionally, at the ends along the guide.
  const placed = at.map((_, i) => i).filter((i) => Number.isFinite(at[i]));
  if (placed.length < 8) return times;
  const beatAt = (i: number) => {
    if (Number.isFinite(at[i])) return at[i];
    const k = placed.findIndex((p) => p > i);
    if (k > 0) {
      const a = placed[k - 1];
      const b = placed[k];
      return at[a] + ((at[b] - at[a]) * (tabBeats[i] - tabBeats[a])) / (tabBeats[b] - tabBeats[a]);
    }
    const near = k === 0 ? placed[0] : placed[placed.length - 1];
    return guide(tabBeats[i]) + (at[near] - guide(tabBeats[near]));
  };
  let bi = 0;
  timeline.bars.forEach((b, k) => {
    while (bi + 1 < tabBeats.length && tabBeats[bi] < b.ms - 1) bi++;
    times[k] = beatAt(bi);
  });
  return times;
}
