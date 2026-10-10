import { addDays, weekStart, weekday } from "./date";
import type { PracticeSettings } from "@/store/data";
import type { BlockKind, SessionLog, TempoEntry } from "@/shared/types";

const sessionSeconds = (s: SessionLog) => s.blocks.reduce((sum, b) => sum + b.actualSec, 0);

export function minutesBetween(sessions: SessionLog[], from: string, to: string) {
  return Math.round(sessions.filter((s) => s.date >= from && s.date <= to).reduce((sum, s) => sum + sessionSeconds(s), 0) / 60);
}

export function minutesByBlock(sessions: SessionLog[], from: string): Record<BlockKind, number> {
  const out = { warmup: 0, new: 0, review: 0, improv: 0 } as Record<BlockKind, number>;
  for (const s of sessions) if (s.date >= from) for (const b of s.blocks) out[b.kind] += b.actualSec / 60;
  for (const k of Object.keys(out) as BlockKind[]) out[k] = Math.round(out[k]);
  return out;
}

/** Days with at least one session, for the calendar. */
export function practiceDays(sessions: SessionLog[]) {
  const map = new Map<string, number>();
  for (const s of sessions) map.set(s.date, (map.get(s.date) ?? 0) + Math.round(sessionSeconds(s) / 60));
  return map;
}

/**
 * Weeks in a row where every planned practice day had a session (the current week counts
 * once it is complete or still on track). Extra sessions on other days can stand in for a missed one.
 */
export function weekStreak(sessions: SessionLog[], practice: Pick<PracticeSettings, "days">, today: string) {
  const days = practiceDays(sessions);
  const needed = practice.days.length;
  let streak = 0;
  let week = weekStart(today);
  // Current week: count it if already complete; otherwise it doesn't break the streak yet.
  const countIn = (start: string, end: string) => {
    let n = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) if (days.has(d)) n++;
    return n;
  };
  const thisWeek = countIn(week, today);
  if (thisWeek >= needed) streak++;
  else {
    const left = practice.days.filter((d) => {
      for (let x = addDays(today, 1); x <= addDays(week, 6); x = addDays(x, 1)) if (weekday(x) === d) return true;
      return false;
    }).length;
    if (thisWeek + left < needed) return 0;
  }
  for (;;) {
    week = addDays(week, -7);
    if (countIn(week, addDays(week, 6)) >= needed) streak++;
    else break;
  }
  return streak;
}

/** Day streak: consecutive planned practice days (from the last one) that had a session. */
export function sessionStreak(sessions: SessionLog[], practice: Pick<PracticeSettings, "days">, today: string) {
  const days = practiceDays(sessions);
  let n = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  for (let guard = 0; guard < 400; guard++, d = addDays(d, -1)) {
    if (!practice.days.includes(weekday(d)) && !days.has(d)) continue;
    if (days.has(d)) n++;
    else break;
  }
  return n;
}

/** New personal bests (clean) since `from`. */
export function recordsSince(log: TempoEntry[], from: string) {
  const out: TempoEntry[] = [];
  const best = new Map<string, number>();
  for (const t of [...log].sort((a, b) => a.at - b.at)) {
    if (t.result !== "clean" || !t.bpm) continue;
    const k = `${t.itemId}#${t.sectionId ?? ""}`;
    const prev = best.get(k);
    if (prev === undefined || t.bpm > prev) {
      if (t.date >= from && prev !== undefined) out.push({ ...t, note: String(prev) });
      best.set(k, t.bpm);
    }
  }
  return out;
}
