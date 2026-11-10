import { describe, expect, it } from "vitest";
import { VIDEO_RATES, seekTarget, stepRate } from "./videoControls";

describe("stepRate", () => {
  it("moves to the neighbouring speed", () => {
    expect(stepRate(VIDEO_RATES, 1, -1)).toBe(0.75);
    expect(stepRate(VIDEO_RATES, 1, 1)).toBe(1.25);
  });

  it("stays at the ends of the list", () => {
    expect(stepRate(VIDEO_RATES, 0.25, -1)).toBe(0.25);
    expect(stepRate(VIDEO_RATES, 1.5, 1)).toBe(1.5);
  });

  it("finds the neighbour for a speed outside the list, in any order", () => {
    expect(stepRate([1, 0.5, 2], 0.8, 1)).toBe(1);
    expect(stepRate([1, 0.5, 2], 0.8, -1)).toBe(0.5);
  });
});

describe("seekTarget", () => {
  it("jumps by the delta", () => {
    expect(seekTarget(10, 5, 60)).toBe(15);
    expect(seekTarget(10, -2, 60)).toBe(8);
  });

  it("stays inside the video", () => {
    expect(seekTarget(1, -5, 60)).toBe(0);
    expect(seekTarget(58, 5, 60)).toBe(60);
  });

  it("has no upper limit while the length is unknown", () => {
    expect(seekTarget(10, 5, 0)).toBe(15);
  });
});
