// Alignment on a fake recording built from a tab. Uses a generated song with drums by default;
// point GP at a real Guitar Pro file to try it on that: GP=path npx vitest run tests/autosync.test.ts
import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";
import { readFileSync } from "node:fs";
import { FPS, align } from "@/lib/align";
import { scoreTimeline } from "@/lib/autoSync";

const gp = process.env.GP;

/** 64 bars of lead + drums that vary bar to bar (rests, rhythms, fills), with a tempo change halfway. */
function generatedSong() {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const RHYTHMS = [":16 a a a a a a a a a a a a a a a a", ":8 a a r a a a r a", ":4 a :8 a a :4 r a", ":8 a :16 a a :8 a r :4 a a", ":4 a a a a", ":2 a :8 a a a a"];
  const DRUMS = [":8 36 42 38 42 36 36 38 42", ":8 36 42 38 42 36 42 38 38", ":4 36 38 36 38", ":16 38 38 38 38 :8 38 38 :4 49 36", ":8 36 r 38 42 36 36 r 42"];
  const fill = (pattern: string, note: () => string) => pattern.replace(/\ba\b/g, note);
  const bars = (fn: (i: number) => string) => Array.from({ length: 64 }, (_, i) => (i === 32 ? "\\tempo 120 " : "") + fn(i)).join(" |\n") + " |";
  const lead = bars(() => fill(RHYTHMS[Math.floor(rnd() * RHYTHMS.length)], () => `${3 + Math.floor(rnd() * 10)}.${1 + Math.floor(rnd() * 4)}`));
  const drums = bars(() => DRUMS[Math.floor(rnd() * DRUMS.length)]);
  const tex = `\\tempo 140 .\n\\track "Lead" \\staff {tabs}\n${lead}\n\\track "Drums" \\instrument percussion \\staff {score}\n${drums}`;
  return alphaTab.importer.ScoreLoader.loadAlphaTex(tex, new alphaTab.Settings());
}
const loadScore = () =>
  gp ? alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(gp)), new alphaTab.Settings()) : generatedSong();

/** The band slowly drifts away from the tab in the second half (a live recording). */
const driftAt = (ms: number, after: number, drift: number, total: number) => (ms <= after ? 0 : (drift * (ms - after)) / (total - after));

/** A fake "recording": the score's onsets, shifted, stretched, drifting, with noise and missing notes. */
function fakeRecording(timeline: ReturnType<typeof scoreTimeline>, offset: number, scale: number, driftAfterMs: number, drift: number) {
  const env = new Float32Array(Math.ceil(((timeline.durationMs * scale + offset + 4000) / 1000) * FPS));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < env.length; i++) env[i] = rnd() * 0.25; // noise floor
  for (const o of timeline.onsets) {
    if (rnd() < 0.25) continue; // 25 % of notes not audible
    const t = offset + o.ms * scale + driftAt(o.ms, driftAfterMs, drift, timeline.durationMs) + (rnd() - 0.5) * 20;
    const f = Math.round((t / 1000) * FPS);
    if (f >= 0 && f < env.length) env[f] = Math.min(1, env[f] + 0.5 + rnd() * 0.5);
  }
  return env;
}

describe("auto sync", () => {
  it.each([
    [0, 1.0, 0],
    [12000, 0.97, -200],
    [800, 1.0, 400],
  ])("also finds offset %i ms, tempo ×%f, drift %i ms", (offset, scale, drift) => {
    const score = loadScore();
    const timeline = scoreTimeline(score);
    const half = timeline.durationMs / 2;
    const r = align(timeline, fakeRecording(timeline, offset, scale, half, drift));
    expect(Math.abs(r.offsetMs - offset)).toBeLessThan(40);
    expect(Math.abs(r.scale - scale)).toBeLessThan(0.004);
    const errs = r.points.map((p) => {
      const bar = timeline.bars.find((b) => b.bar === p.bar && b.occurrence === (p.occurrence ?? 0))!;
      return Math.abs(p.ms - (offset + bar.ms * scale + driftAt(bar.ms, half, drift, timeline.durationMs)));
    });
    expect(Math.max(...errs)).toBeLessThan(60);
  });

  it("recovers offset, tempo factor and a gradual drift", () => {
    const score = loadScore();
    const timeline = scoreTimeline(score);
    const half = timeline.durationMs / 2;
    const env = fakeRecording(timeline, 3500, 1.02, half, 300);
    const t0 = performance.now();
    const r = align(timeline, env);
    console.log("ms", Math.round(performance.now() - t0), "offset", r.offsetMs, "scale", r.scale, "confidence", r.confidence, "points", r.points.length);
    expect(Math.abs(r.offsetMs - 3500)).toBeLessThan(40);
    expect(Math.abs(r.scale - 1.02)).toBeLessThan(0.004);
    // every point should land where the bar really is in the fake recording
    for (const p of r.points) {
      const bar = timeline.bars.find((b) => b.bar === p.bar && b.occurrence === (p.occurrence ?? 0))!;
      const truth = 3500 + bar.ms * 1.02 + driftAt(bar.ms, half, 300, timeline.durationMs);
      expect(Math.abs(p.ms - truth), `bar ${p.bar}`).toBeLessThan(60);
    }
  });
});

describe("a tempo change the recording plays differently", () => {
  // The generated song goes 140 → 120 at bar 33 (Technical Difficulties: 130 → 120 at bar 50 and back);
  // a band may not slow down there at all, or slow down by another amount.
  it.each([
    ["keeps the old tempo", 140],
    ["slows down more", 110],
    ["slows down as written", 120],
  ])("follows a band that %s", (_, bandBpm) => {
    const score = loadScore();
    const timeline = scoreTimeline(score);
    expect(timeline.tempoBars?.length).toBeGreaterThan(0);
    const change = timeline.bars.find((b) => b.bar === timeline.tempoBars![0] && b.occurrence === 0)!.ms;
    const offset = 2500;
    const truth = (ms: number) => offset + (ms <= change ? ms : change + ((ms - change) * 120) / bandBpm);

    const env = new Float32Array(Math.ceil(((truth(timeline.durationMs) + 4000) / 1000) * FPS));
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < env.length; i++) env[i] = rnd() * 0.25;
    for (const o of timeline.onsets) {
      if (rnd() < 0.25) continue;
      const f = Math.round(((truth(o.ms) + (rnd() - 0.5) * 20) / 1000) * FPS);
      if (f >= 0 && f < env.length) env[f] = Math.min(1, env[f] + 0.5 + rnd() * 0.5);
    }
    const r = align(timeline, env);
    for (const p of r.points) {
      const bar = timeline.bars.find((b) => b.bar === p.bar && b.occurrence === (p.occurrence ?? 0))!;
      expect(Math.abs(p.ms - truth(bar.ms)), `bar ${p.bar}`).toBeLessThan(60);
    }
  });
});

describe("a repeat the recording plays once", () => {
  it("aligns the first pass with the recording and skips the missing one", async () => {
    const { applyBackingTrack } = await import("@/lib/backingTrack");
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const RHYTHMS = [":16 a a a a a a a a a a a a a a a a", ":8 a a r a a a r a", ":4 a :8 a a :4 r a", ":8 a :16 a a :8 a r :4 a a"];
    const DRUMS = [":8 36 42 38 42 36 36 38 42", ":4 36 38 36 38", ":16 38 38 38 38 :8 38 38 :4 49 36", ":8 36 r 38 42 36 36 r 42"];
    const bar = (i: number, kind: "lead" | "drums") => {
      const body = kind === "lead" ? RHYTHMS[Math.floor(rnd() * RHYTHMS.length)].replace(/\ba\b/g, () => `${3 + Math.floor(rnd() * 10)}.${1 + Math.floor(rnd() * 4)}`) : DRUMS[Math.floor(rnd() * DRUMS.length)];
      return (i === 0 ? "\\ro " : i === 1 ? "\\rc 2 " : "") + body;
    };
    const track = (kind: "lead" | "drums") => Array.from({ length: 40 }, (_, i) => bar(i, kind)).join(" |\n") + " |";
    const tex = `\\tempo 130 .\n\\track "Lead" \\staff {tabs}\n${track("lead")}\n\\track "Drums" \\instrument percussion \\staff {score}\n${track("drums")}`;
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex, new alphaTab.Settings());
    const timeline = scoreTimeline(score);
    expect(timeline.bars.slice(0, 5).map((b) => b.bar)).toEqual([1, 2, 1, 2, 3]);

    // The band plays bars 1–2 once: drop the first pass, everything else 2 bars earlier, plus a 1.5 s lead-in.
    const passMs = timeline.bars[2].ms;
    const kept = { ...timeline, onsets: timeline.onsets.filter((o) => o.ms >= passMs).map((o) => ({ ...o, ms: o.ms - passMs })) };
    const env = fakeRecording({ ...kept, durationMs: timeline.durationMs - passMs }, 1500, 1, Infinity, 0);
    const r = align(timeline, env);

    expect(r.skippedRepeat).toBe(true);
    expect(r.unrepeat).toEqual([2]);
    expect(r.points.some((p) => p.occurrence)).toBe(false);
    expect(Math.abs((r.bar1Ms ?? 0) - 1500)).toBeLessThan(60);

    // With the repeat switched off, alphaTab plays 1, 2, 3… and every bar lands where the band plays it.
    applyBackingTrack(score, null, r.points, r.unrepeat);
    const synced = alphaTab.midi.MidiFileGenerator.generateSyncPoints(score);
    expect(synced.some((p) => p.masterBarOccurence > 0 && p.masterBarIndex < 2)).toBe(false);
    const at = (index: number) => synced.find((p) => p.masterBarIndex === index && p.masterBarOccurence === 0)?.syncTime ?? NaN;
    const inRecording = (playedIndex: number) => 1500 + (timeline.bars[playedIndex].ms - passMs); // bars after the dropped pass
    expect(Math.abs(at(2) - inRecording(4))).toBeLessThan(80); // bar 3
    expect(Math.abs(at(4) - inRecording(6))).toBeLessThan(80); // bar 5
    const bar3 = synced.find((p) => p.masterBarIndex === 2)!;
    expect(Math.abs(bar3.syncBpm - 130)).toBeLessThan(5);
  });
});
