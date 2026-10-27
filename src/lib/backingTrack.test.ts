import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { applyBackingTrack, misplacedMarks, shortBars } from "./backingTrack";
import { formatClockMs, parseClock } from "./clock";

const tex = `\\tempo 120 . \\track "G" \\staff {tabs} \\ts 4 4 :4 1.1 1.1 1.1 1.1 | 1.1 1.1 1.1 1.1 | 1.1 1.1 1.1 1.1 |`;
const load = () => alphaTab.importer.ScoreLoader.loadAlphaTex(tex, new alphaTab.Settings());

describe("backing track", () => {
  it("attaches audio and places sync points on bars", () => {
    const score = load();
    const used = applyBackingTrack(score, new Uint8Array([1, 2, 3]), [
      { bar: 3, ms: 4200 },
      { bar: 1, ms: 250 },
      { bar: 9, ms: 1 }, // out of range → ignored
    ]);
    expect(score.backingTrack?.rawAudioFile?.length).toBe(3);
    expect(used.map((p) => p.bar)).toEqual([1, 3]);
    expect(score.masterBars[0].syncPoints?.[0].syncPointValue?.millisecondOffset).toBe(250);
    expect(score.masterBars[1].syncPoints).toBeUndefined();
    expect(score.masterBars[2].syncPoints?.[0].type).toBe(alphaTab.model.AutomationType.SyncPoint);
  });
  it("defaults to bar 1 at 0 ms and replaces old points", () => {
    const score = load();
    applyBackingTrack(score, null, [{ bar: 2, ms: 2000 }]);
    applyBackingTrack(score, null, []);
    expect(score.masterBars[0].syncPoints?.[0].syncPointValue?.millisecondOffset).toBe(0);
    expect(score.masterBars[1].syncPoints).toBeUndefined();
  });
  it("stretches time between points to follow the recording", () => {
    const score = load(); // 120 bpm → 2 s per bar
    applyBackingTrack(score, null, [
      { bar: 1, ms: 1000 },
      { bar: 3, ms: 6000 }, // two bars take 5 s in the recording instead of 4 s
    ]);
    const points = alphaTab.midi.MidiFileGenerator.generateSyncPoints(score);
    expect(points[0].syncTime).toBe(1000);
    expect(points[0].syncBpm).toBeCloseTo(96, 0); // 120 × 4/5
    expect(points[1].syncTime).toBe(6000);
  });
  it("finds marks out of order and leaves them out", () => {
    // Bar 2 marked at a moment long before bar 1 (⏱ pressed while the recording was elsewhere).
    const points = [
      { bar: 1, ms: 1000 },
      { bar: 2, ms: 300 },
      { bar: 3, ms: 5000 },
      { bar: 1, occurrence: 1, ms: 100 }, // a later pass isn't judged
    ];
    expect(misplacedMarks([{ bar: 1, ms: 0 }, { bar: 2, ms: 2000 }])).toEqual([]);
    // As in a real song: a long run of marks in order and one that isn't.
    const song = [0, 2000, 4000, 300, 8000, 10000].map((ms, i) => ({ bar: i + 1, ms }));
    expect(misplacedMarks(song)).toEqual([{ bar: 4, ms: 300 }]);
    const score = load();
    const used = applyBackingTrack(score, null, points);
    expect(used.filter((p) => !p.occurrence).length).toBe(2);
    expect(used.some((p) => p.bar === 3)).toBe(true);
  });
  it("finds bars the recording doesn't play", () => {
    // 2 s bars in the tab, 2.06 s in the recording; bars 9–10 squeezed into 1 s (a riff the band plays once less).
    const times = [...Array(9)].map((_, i) => i * 2060);
    const points = [...times, 8 * 2060 + 740, 8 * 2060 + 1040, ...[...Array(8)].map((_, i) => 8 * 2060 + 1040 + (i + 1) * 2060)].map((ms, i) => ({ bar: i + 1, ms }));
    const barMs = Array(20).fill(2000);
    expect(shortBars(points, barMs)).toEqual([{ from: 9, to: 10, ms: 1040, expectedMs: 4120 }]);
    expect(shortBars(points.slice(0, 9), barMs)).toEqual([]);
  });
  it("parses and formats times", () => {
    expect(parseClock("1:23.4")).toBe(83400);
    expect(parseClock("12,5")).toBe(12500);
    expect(parseClock("abc")).toBeNull();
    expect(formatClockMs(83400)).toBe("1:23.4");
    expect(formatClockMs(5000)).toBe("0:05.0");
  });
});
