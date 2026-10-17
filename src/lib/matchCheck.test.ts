import { describe, expect, it } from "vitest";
import { CHROMA_FPS } from "./chroma";
import { mappingFromPoints, matchWarnings, noteChroma } from "./matchCheck";

const fits = { harmony: 1.6, bestHarmony: 1.6, shift: 0, lengthRatio: 1, rhythm: 1.4 };

describe("matchWarnings", () => {
  it("says nothing when the recording fits", () => {
    expect(matchWarnings(fits)).toEqual([]);
  });
  it("names another tuning or a capo for a shift of 1–4 semitones", () => {
    expect(matchWarnings({ ...fits, harmony: 0.8, shift: -1 })[0]).toMatch(/на полтона ниже.*строй Eb/);
    expect(matchWarnings({ ...fits, harmony: 0.9, shift: -2 })[0]).toMatch(/на тон ниже.*строй D/);
    expect(matchWarnings({ ...fits, harmony: 0.9, shift: 2 })[0]).toMatch(/на тон выше.*каподастр на 2 ладу/);
    expect(matchWarnings({ ...fits, harmony: 0.9, shift: -1, rhythm: 1.1 })[0]).toMatch(/Или это другая запись/);
  });
  it("calls it another song when no small shift fits clearly (a fourth looks like a related key)", () => {
    expect(matchWarnings({ ...fits, harmony: 1.3, bestHarmony: 1.55, shift: 5 })[0]).toMatch(/другая песня/);
    expect(matchWarnings({ ...fits, harmony: 1.3, bestHarmony: 1.4, shift: -1 })[0]).toMatch(/другая песня/);
  });
  it("notices a recording much shorter or longer than the tab", () => {
    expect(matchWarnings({ ...fits, lengthRatio: 0.4 })).toEqual(["Запись заметно короче табов — возможно, в ней только часть песни."]);
    expect(matchWarnings({ ...fits, lengthRatio: 1.7 })[0]).toMatch(/длиннее/);
  });
});

describe("noteChroma", () => {
  it("hears A440 as A", () => {
    const sr = 22050;
    const samples = Float32Array.from({ length: sr * 2 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / sr));
    const chroma = noteChroma(samples, sr);
    const f = Math.floor(chroma.length / 12 / 2) * 12;
    const frame = Array.from(chroma.slice(f, f + 12));
    expect(frame.indexOf(Math.max(...frame))).toBe(9);
    expect(chroma.length / 12).toBeGreaterThan(CHROMA_FPS);
  });
});

describe("mappingFromPoints", () => {
  it("interpolates between sync points and extends past them", () => {
    const timeline = {
      onsets: [],
      bars: [
        { bar: 1, occurrence: 0, ms: 0 },
        { bar: 2, occurrence: 0, ms: 2000 },
        { bar: 3, occurrence: 0, ms: 4000 },
      ],
      durationMs: 6000,
    };
    const map = mappingFromPoints(timeline, [
      { bar: 1, ms: 1000 },
      { bar: 3, ms: 9000 },
    ]);
    expect(map(2000)).toBe(5000);
    expect(map(6000)).toBe(13000);
  });
});
