import * as alphaTab from "@coderline/alphatab";
import type { SyncPoint } from "@/shared/types";

/**
 * First-pass marks out of order: a bar that starts before an earlier bar does in the recording (or after a later
 * one) — a mark put at the wrong moment. Such a point would send the notes back and forth, so it isn't used.
 * Kept: the longest run of first passes whose times grow with the bar; the rest is returned.
 * Later passes (repeats) aren't judged: they come back to earlier bars by design.
 */
export function misplacedMarks(points: SyncPoint[]): SyncPoint[] {
  const firsts = points.filter((p) => !p.occurrence).sort((a, b) => a.bar - b.bar);
  // Longest strictly increasing subsequence by ms (patience sorting), with links to rebuild it.
  const tails: number[] = [];
  const prev = new Array<number>(firsts.length).fill(-1);
  firsts.forEach((p, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (firsts[tails[mid]].ms < p.ms) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const keep = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) keep.add(i);
  return firsts.filter((_, i) => !keep.has(i));
}

/** Bars much shorter in the recording than the tab makes them: there are none of them in the recording, most likely. */
export interface ShortBars {
  /** First and last bar of the run */
  from: number;
  to: number;
  /** Their time in the recording and what it would be at the recording's tempo there, ms */
  ms: number;
  expectedMs: number;
}

// Shorter than this share of the time a bar takes around it: not played in the recording.
const SHORT = 0.5;
// Run up to here, ms: bars skipped on purpose ("Пропустить в нотах"), not flagged again.
export const SKIPPED_MS = 100;

/**
 * Runs of bars that the recording passes much faster than its own tempo around them (the tab plays a riff once more
 * than the band, say). The tempo is the recording's: time per tab-millisecond over the 8 marked spans on each side.
 * `barMs`: each bar's length in the tab. Only first passes, misplaced marks left out.
 */
export function shortBars(points: SyncPoint[], barMs: number[]): ShortBars[] {
  const misplaced = new Set(misplacedMarks(points));
  const firsts = points.filter((p) => !p.occurrence && !misplaced.has(p)).sort((a, b) => a.bar - b.bar);
  const tabMs = (from: number, to: number) => barMs.slice(from - 1, to - 1).reduce((sum, x) => sum + x, 0);
  const spans = firsts.slice(1).map((b, i) => {
    const a = firsts[i];
    const tab = tabMs(a.bar, b.bar);
    return { a, b, rec: b.ms - a.ms, tab, rate: tab > 0 ? (b.ms - a.ms) / tab : 1 };
  });
  const runs: ShortBars[] = [];
  spans.forEach((span, i) => {
    if (span.tab <= 0) return;
    const from = Math.max(0, i - 8);
    const around = spans
      .slice(from, i + 9)
      .filter((_, j) => j !== i - from)
      .map((x) => x.rate)
      .sort((x, y) => x - y);
    const rate = around.length ? around[around.length >> 1] : 1;
    if (span.rate >= rate * SHORT) return;
    const last = runs.at(-1);
    if (last && last.to + 1 === span.a.bar) {
      last.to = span.b.bar - 1;
      last.ms += span.rec;
      last.expectedMs += span.tab * rate;
    } else runs.push({ from: span.a.bar, to: span.b.bar - 1, ms: span.rec, expectedMs: span.tab * rate });
  });
  return runs.map((r) => ({ ...r, ms: Math.round(r.ms), expectedMs: Math.round(r.expectedMs) }));
}

/** Each bar's length in ms at the tempo written in the tab. */
export function barLengths(score: alphaTab.model.Score) {
  let tempo = score.tempo;
  return score.masterBars.map((m) => {
    tempo = m.tempoAutomations[0]?.value ?? tempo;
    return ((m.timeSignatureNumerator * 4) / m.timeSignatureDenominator) * (60_000 / tempo);
  });
}

// A skipped bar's share of the recording, ms: just enough for the marks to stay in order.
const SKIP_MS = 2;

/**
 * The marks with bars the recording doesn't play taken out of its time: each run of them gets a few ms right
 * before the next bar that is played, so the notes jump over them (and stay so however the lines around move).
 * That next bar needs a time: its mark, or where it falls between the marks around it with the skipped bars taking
 * none. Their own marks are dropped. Only the first pass is skipped (later passes of a repeat keep playing).
 */
export function withSkipped(points: SyncPoint[], skip: number[], barMs: number[]): SyncPoint[] {
  if (!skip.length) return points;
  const skipped = new Set(skip);
  const kept = points.filter((p) => !(skipped.has(p.bar) && !p.occurrence));
  const firsts = kept.filter((p) => !p.occurrence).sort((a, b) => a.bar - b.bar);
  // Tab time from one bar's start to another's, the skipped ones not counted.
  const played = (from: number, to: number) => {
    let ms = 0;
    for (let b = from; b < to; b++) if (!skipped.has(b)) ms += barMs[b - 1] ?? 0;
    return ms;
  };
  const timeOf = (bar: number) => {
    const own = firsts.find((p) => p.bar === bar);
    if (own) return own.ms;
    const before = firsts.filter((p) => p.bar < bar).at(-1);
    const after = firsts.find((p) => p.bar > bar);
    if (before && after && played(before.bar, after.bar) > 0)
      return before.ms + ((after.ms - before.ms) * played(before.bar, bar)) / played(before.bar, after.bar);
    return null;
  };
  const extra: SyncPoint[] = [];
  const bars = [...skipped].sort((a, b) => a - b);
  for (let i = 0; i < bars.length; ) {
    let j = i;
    while (j + 1 < bars.length && bars[j + 1] === bars[j] + 1) j++;
    const [from, to] = [bars[i], bars[j]];
    i = j + 1;
    const next = to + 1;
    const ms = timeOf(next);
    if (ms === null || next > barMs.length) continue;
    if (!firsts.some((p) => p.bar === next)) extra.push({ bar: next, ms: Math.round(ms) });
    for (let b = from; b <= to; b++) extra.push({ bar: b, ms: Math.round(ms) - (to - b + 1) * SKIP_MS });
  }
  return [...kept, ...extra];
}

/**
 * Attach a recording to a score and tell alphaTab where bars start in it. Between sync points
 * alphaTab stretches its time axis, so a live recording that speeds up or slows down still lines up.
 * Without points, bar 1 is assumed to start at 0 ms.
 */
export function applyBackingTrack(score: alphaTab.model.Score, audio: Uint8Array | null, points: SyncPoint[], unrepeat: number[] = [], skip: number[] = []) {
  // Repeats the band plays once: play them once too, so bars follow the recording's order.
  for (const bar of unrepeat) {
    const m = score.masterBars[bar - 1];
    if (m && m.repeatCount > 1) m.repeatCount = 0;
  }
  if (audio) {
    const track = new alphaTab.model.BackingTrack();
    track.rawAudioFile = audio;
    score.backingTrack = track;
  }
  for (const bar of score.masterBars) bar.syncPoints = undefined;
  points = withSkipped(points, skip, barLengths(score));
  const misplaced = new Set(misplacedMarks(points));
  const valid = [...(points.length ? points : [{ bar: 1, ms: 0 }])]
    .filter((p) => p.bar >= 1 && p.bar <= score.masterBars.length && p.ms >= 0 && !misplaced.has(p))
    .sort((a, b) => a.bar - b.bar || (a.occurrence ?? 0) - (b.occurrence ?? 0));
  for (const p of valid) {
    const a = new alphaTab.model.Automation();
    a.type = alphaTab.model.AutomationType.SyncPoint;
    a.ratioPosition = 0;
    const data = new alphaTab.model.SyncPointData();
    data.barOccurence = p.occurrence ?? 0;
    data.millisecondOffset = p.ms;
    a.syncPointValue = data;
    score.masterBars[p.bar - 1].addSyncPoint(a);
  }
  return valid;
}
