import * as alphaTab from "@coderline/alphatab";
import { scoreTimeline } from "./autoSync";
import { applyBackingTrack } from "./backingTrack";
import type { SyncPoint } from "@/shared/types";

/** The tab laid on the recording's time: its notes and where each played bar starts, as the marks place them. */
export interface Lane {
  /** Note starts, ms in the recording, with their MIDI key */
  notes: { ms: number; key: number }[];
  /** Every played bar (repeats included), in playback order, ms in the recording; `skipped`: not in the recording */
  bars: { bar: number; occurrence: number; ms: number; skipped?: boolean }[];
  /** Lowest and highest key, for the height of a note */
  keys: [number, number];
}

/**
 * Builds the tab's timeline once (at its own tempo); each call maps it onto the recording through the marks, the
 * way alphaTab follows a backing track (its sync points: tab time ↔ recording time). Answers are kept until the
 * marks change, since a dragged line asks every frame.
 */
export function laneMaker(tab: ArrayBuffer, unrepeat: number[]) {
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(tab), new alphaTab.Settings());
  // Repeats the recording plays once: once in the timeline too.
  applyBackingTrack(score, null, [], unrepeat);
  const timeline = scoreTimeline(score);
  const notes = timeline.notes ?? [];
  const keys: [number, number] = notes.length ? [Math.min(...notes.map((n) => n.key)), Math.max(...notes.map((n) => n.key))] : [40, 80];
  let last: { key: string; lane: Lane } | null = null;

  // Which played bar (index into timeline.bars) each note is in, for leaving out the notes of skipped bars.
  let b = 0;
  const noteBar = notes.map((n) => {
    while (b + 1 < timeline.bars.length && timeline.bars[b + 1].ms <= n.ms) b++;
    return b;
  });

  return (points: SyncPoint[], skip: number[] = []): Lane => {
    const key = JSON.stringify([points, skip]);
    if (last?.key === key) return last.lane;
    applyBackingTrack(score, null, points, [], skip);
    const skipped = new Set(skip);
    // Skipped: the first pass of those bars (see withSkipped).
    const off = timeline.bars.map((x) => skipped.has(x.bar) && x.occurrence === 0);
    const pts = alphaTab.midi.MidiFileGenerator.generateSyncPoints(score).sort((a, b) => a.synthTime - b.synthTime);
    let i = 0;
    // Tab ms → recording ms; asked in growing order (notes, then bars), so the search mostly goes forward.
    const toAudio = (t: number) => {
      if (!pts.length) return t;
      if (t < pts[i].synthTime) i = 0;
      while (i + 1 < pts.length && pts[i + 1].synthTime <= t) i++;
      const [p, q] = [pts[i], pts[i + 1]];
      if (q && q.synthTime > p.synthTime) return p.syncTime + ((t - p.synthTime) * (q.syncTime - p.syncTime)) / (q.synthTime - p.synthTime);
      return p.syncTime + ((t - p.synthTime) * p.synthBpm) / (p.syncBpm || p.synthBpm);
    };
    const lane: Lane = {
      notes: notes.flatMap((n, k) => (off[noteBar[k]] ? [] : [{ ms: toAudio(n.ms), key: n.key }])),
      bars: timeline.bars.map((x, k) => ({ ...x, ms: toAudio(x.ms), ...(off[k] ? { skipped: true } : {}) })),
      keys,
    };
    last = { key, lane };
    return lane;
  };
}
