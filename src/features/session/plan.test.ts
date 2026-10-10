import { describe, expect, it } from "vitest";
import { buildPlan } from "./plan";
import { STARTER_LIBRARY } from "@/data/library";
import { DEFAULT_PRACTICE } from "@/store/data";
import { weekStreak, sessionStreak, recordsSince } from "@/lib/stats";
import { cleanBpm } from "@/lib/progress";
import type { Item, SessionLog, TempoEntry } from "@/shared/types";

const base = { items: STARTER_LIBRARY, lastPlayed: {}, recentKeys: [], practice: DEFAULT_PRACTICE };

describe("buildPlan", () => {
  it("builds four blocks from the starter library", () => {
    const plan = buildPlan(base, () => 0);
    expect(plan.map((b) => b.kind)).toEqual(["warmup", "new", "review", "improv"]);
    expect(plan[0].entries).toHaveLength(5);
    expect(plan[1].entries).toHaveLength(2);
    expect(plan[2].entries.map((e) => e.itemId)).toEqual(["th-penta5", "th-modes"]);
    expect(plan[3].improv?.key).toBeTruthy();
  });
  it("takes the least recently played active units first", () => {
    const lastPlayed = { "tech-3nps": "2026-10-09", "tech-gilbert-skip": "2026-10-01", "song-tech-diff#intro": "2026-10-05" };
    const plan = buildPlan({ ...base, lastPlayed });
    expect(plan[1].entries).toEqual([{ itemId: "tech-gilbert-skip" }, { itemId: "song-tech-diff", sectionId: "intro" }]);
  });
  it("puts pinned rotation units first and falls back to active units", () => {
    const items: Item[] = STARTER_LIBRARY.map((i) =>
      i.id === "song-tech-diff" ? { ...i, sections: i.sections!.map((s, n) => ({ ...s, status: n === 0 ? "rotation" : n === 1 ? "active" : "queue" })) } : i,
    );
    const lastPlayed = { "song-tech-diff#intro": "2026-10-09", "tech-3nps": "2026-10-09" };
    const plan = buildPlan({ ...base, items, lastPlayed });
    expect(plan[2].entries[0]).toEqual({ itemId: "song-tech-diff", sectionId: "intro" });
    expect(plan[1].entries).toContainEqual({ itemId: "song-tech-diff", sectionId: "riff" });

    const noRotation = STARTER_LIBRARY.map((i) => (i.status === "rotation" ? { ...i, status: "queue" as const } : i));
    const p2 = buildPlan({ ...base, items: noRotation, practice: { ...DEFAULT_PRACTICE, maxNew: 1 } });
    expect(p2[2].entries.length).toBeGreaterThan(0);
    expect(p2[2].entries).not.toContainEqual(p2[1].entries[0]);
  });
});

const session = (date: string, minutes = 60): SessionLog => ({
  id: date,
  date,
  startedAt: 0,
  endedAt: 0,
  blocks: [{ kind: "new", plannedSec: 0, actualSec: minutes * 60, entries: [] }],
});

describe("stats", () => {
  const practice = { days: [1, 3, 6] }; // Mon, Wed, Sat
  it("counts complete weeks", () => {
    // 2026-10-05 is a Monday
    const sessions = ["2026-09-28", "2026-09-30", "2026-10-03", "2026-10-05", "2026-10-07", "2026-10-10"].map((d) => session(d));
    expect(weekStreak(sessions, practice, "2026-10-10")).toBe(2);
    expect(weekStreak(sessions.slice(0, 5), practice, "2026-10-08")).toBe(1); // this week still on track
    expect(weekStreak(sessions.slice(0, 4), practice, "2026-10-10")).toBe(0); // only Monday this week, no practice days left
  });
  it("counts the session streak on practice days", () => {
    const sessions = ["2026-10-03", "2026-10-05", "2026-10-07"].map((d) => session(d));
    expect(sessionStreak(sessions, practice, "2026-10-08")).toBe(3);
    expect(sessionStreak(sessions, practice, "2026-10-11")).toBe(0); // Saturday 10th missed
  });
  it("finds tempo records and the clean tempo", () => {
    const t = (date: string, bpm: number, result: TempoEntry["result"] = "clean"): TempoEntry => ({ itemId: "x", date, at: Date.parse(date), bpm, result });
    const log = [t("2026-09-01", 100), t("2026-10-01", 110), t("2026-10-08", 120, "errors"), t("2026-10-09", 115)];
    expect(recordsSince(log, "2026-10-05").map((r) => r.bpm)).toEqual([115]);
    expect(cleanBpm(log, { itemId: "x" }, "2026-10-10")).toBe(115);
    expect(cleanBpm(log.slice(0, 1), { itemId: "x" }, "2026-10-10")).toBe(100);
  });
});
