// Kept apart from backingTrack.ts so the UI can format times without loading alphaTab.

/** "1:23.4" / "83.4" → ms */
export function parseClock(text: string): number | null {
  const m = /^\s*(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*$/.exec(text);
  if (!m) return null;
  return Math.round((Number(m[1] ?? 0) * 60 + Number(m[2].replace(",", "."))) * 1000);
}

export const formatClockMs = (ms: number) => {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
