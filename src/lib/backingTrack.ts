import * as alphaTab from "@coderline/alphatab";
import type { SyncPoint } from "@/shared/types";

/**
 * Attach a recording to a score and tell alphaTab where bars start in it. Between sync points
 * alphaTab stretches its time axis, so a live recording that speeds up or slows down still lines up.
 * Without points, bar 1 is assumed to start at 0 ms.
 */
export function applyBackingTrack(score: alphaTab.model.Score, audio: Uint8Array | null, points: SyncPoint[], unrepeat: number[] = []) {
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
  const valid = [...(points.length ? points : [{ bar: 1, ms: 0 }])]
    .filter((p) => p.bar >= 1 && p.bar <= score.masterBars.length && p.ms >= 0)
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
