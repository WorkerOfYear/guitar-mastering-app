import * as alphaTab from "@coderline/alphatab";
import { scoreTimeline } from "./autoSync";
import { applyBackingTrack } from "./backingTrack";
import type { SyncPoint } from "@/shared/types";

/** The tab laid on the recording's time: its notes and where each played bar starts, as the marks place them. */
export interface Lane {
  /** Note starts, ms in the recording, with their MIDI key */
  notes: { ms: number; key: number }[];
  /** Every played bar (repeats included), in playback order, ms in the recording */
  bars: { bar: number; occurrence: number; ms: number }[];
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

  return (points: SyncPoint[]): Lane => {
    const key = JSON.stringify(points);
    if (last?.key === key) return last.lane;
    applyBackingTrack(score, null, points);
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
      notes: notes.map((n) => ({ ms: toAudio(n.ms), key: n.key })),
      bars: timeline.bars.map((b) => ({ ...b, ms: toAudio(b.ms) })),
      keys,
    };
    last = { key, lane };
    return lane;
  };
}
