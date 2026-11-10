/** Speeds of a plain <video>; YouTube says which of its own are available. */
export const VIDEO_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5];

/** The next speed up (`dir` 1) or down (-1) from this one; the same one at the end of the list. */
export function stepRate(rates: number[], rate: number, dir: 1 | -1) {
  const sorted = [...rates].sort((a, b) => dir * (a - b));
  return sorted.find((r) => dir * (r - rate) > 0) ?? rate;
}

/** Where a jump by `delta` seconds lands: inside the video, whose length may not be known yet (0). */
export function seekTarget(now: number, delta: number, duration: number) {
  const target = Math.max(0, now + delta);
  return duration > 0 ? Math.min(target, duration) : target;
}
