import { describe, expect, it } from "vitest";
import { defaultAccents, planTick, rhythmById, rhythmForSubdivision, RHYTHMS } from "./rhythms";

describe("planTick", () => {
  it("accents the chosen beats and softens the rest", () => {
    const r = rhythmById("q");
    const kinds = [0, 4, 8, 12].map((p) => planTick(r, 4, [1, 3], p).kind); // four ticks per beat
    expect(kinds).toEqual(["accent", "beat", "accent", "beat"]);
  });

  it("plays only the ticks of the pattern", () => {
    const r = rhythmById("d8s"); // 8. + 16
    expect([0, 1, 2, 3].map((p) => planTick(r, 3, [1], p).kind)).toEqual(["accent", null, null, "sub"]);
  });

  it("keeps a rest on the downbeat silent even when it is accented", () => {
    expect(planTick(rhythmById("re"), 4, [1], 0).kind).toBeNull();
  });

  it("wraps around the bar and reports beat/tick", () => {
    const r = rhythmById("t3");
    expect(planTick(r, 2, [1], 7)).toEqual({ beat: 0, tick: 1, kind: "sub" });
    expect(planTick(r, 2, [1], 5)).toEqual({ beat: 1, tick: 2, kind: "sub" });
  });
});

describe("rhythms", () => {
  it("has unique ids and valid ticks", () => {
    expect(new Set(RHYTHMS.map((r) => r.id)).size).toBe(RHYTHMS.length);
    for (const r of RHYTHMS) expect(r.play.every((t) => t >= 1 && t <= r.grid)).toBe(true);
  });

  it("maps item subdivisions to a pattern with matching grid", () => {
    expect(rhythmById(rhythmForSubdivision(3)).grid).toBe(3);
    expect(rhythmById(rhythmForSubdivision(4)).play).toHaveLength(4);
    expect(rhythmById(rhythmForSubdivision(6)).grid).toBe(6);
  });

  it("groups compound meters by three", () => {
    expect(defaultAccents(6, 8)).toEqual([1, 4]);
    expect(defaultAccents(12, 8)).toEqual([1, 4, 7, 10]);
    expect(defaultAccents(4, 4)).toEqual([1]);
    expect(defaultAccents(3, 8)).toEqual([1]);
  });
});
