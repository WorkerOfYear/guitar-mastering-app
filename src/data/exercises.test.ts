import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { chromatic, legatoTriplets, pentatonicBoxes, spider, stretches } from "./exercises";

const load = (tex: string) => alphaTab.importer.ScoreLoader.loadAlphaTex(tex, new alphaTab.Settings());
const beats = (score: ReturnType<typeof load>) => score.tracks[0].staves[0].bars.flatMap((b) => b.voices[0].beats);

describe("warm-up tabs", () => {
  it.each([
    ["chromatic", chromatic(80), 12],
    ["spider", spider(70), 10],
    ["stretches", stretches(60), 24],
    ["legato", legatoTriplets(70), 12],
    ["pentatonic", pentatonicBoxes(70), 15],
  ])("%s parses into full bars", (_name, tex, bars) => {
    const score = load(tex);
    expect(score.masterBars).toHaveLength(bars);
    for (const bar of score.tracks[0].staves[0].bars) expect(bar.voices[0].beats.length).toBeGreaterThan(0);
    expect(beats(score).every((b) => b.notes.length === 1)).toBe(true);
  });
  it("chromatic starts at the 1st fret of the low E and covers all strings", () => {
    const b = beats(load(chromatic(80)));
    expect([b[0].notes[0].fret, b[0].notes[0].string]).toEqual([1, 1]); // alphaTab counts strings from the lowest
    expect(new Set(b.map((x) => x.notes[0].string)).size).toBe(6);
  });
  it("pentatonic box 1 in A starts on the 5th fret", () => {
    const b = beats(load(pentatonicBoxes(70)));
    expect(b.slice(0, 4).map((x) => x.notes[0].fret)).toEqual([5, 8, 5, 7]);
  });
  it("legato notes are hammered and grouped in triplets", () => {
    const b = beats(load(legatoTriplets(70)));
    expect(b[0].tupletNumerator).toBe(3);
    expect(b[0].notes[0].isHammerPullOrigin).toBe(true);
  });
});
