import { describe, expect, it } from "vitest";
import { mergeData } from "./merge";
import { DEFAULT_PRACTICE, type DataState } from "./data";
import { STARTER_LIBRARY } from "@/data/library";

const base = (): DataState => ({ items: STARTER_LIBRARY, log: [], sessions: [], lastPlayed: {}, recentKeys: [], practice: DEFAULT_PRACTICE, deleted: {} });

describe("mergeData", () => {
  it("a fresh device does not override edits from the other one", () => {
    const remote = base();
    remote.items = remote.items.map((i) => (i.id === "tech-3nps" ? { ...i, targetBpm: 180, updatedAt: 1000 } : i));
    const merged = mergeData(base(), remote);
    expect(merged.items.find((i) => i.id === "tech-3nps")?.targetBpm).toBe(180);
    expect(merged.items).toHaveLength(STARTER_LIBRARY.length);
  });
  it("unions logs, sessions and last-played days", () => {
    const a = base();
    const b = base();
    a.log = [{ itemId: "x", date: "2026-10-10", at: 1, bpm: 90, result: "clean" }];
    b.log = [{ itemId: "x", date: "2026-10-11", at: 2, bpm: 95, result: "clean" }, ...a.log];
    a.sessions = [{ id: "s1", date: "2026-10-10", startedAt: 1, endedAt: 2, blocks: [] }];
    b.sessions = [{ id: "s2", date: "2026-10-11", startedAt: 3, endedAt: 4, blocks: [] }];
    a.lastPlayed = { x: "2026-10-10", y: "2026-10-12" };
    b.lastPlayed = { x: "2026-10-11" };
    const m = mergeData(a, b);
    expect(m.log.map((t) => t.at)).toEqual([1, 2]);
    expect(m.sessions.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(m.lastPlayed).toEqual({ x: "2026-10-11", y: "2026-10-12" });
  });
  it("respects deletions and newer re-creations", () => {
    const a = base();
    a.items = a.items.filter((i) => i.id !== "tech-tapping");
    a.deleted = { "tech-tapping": 500 };
    const b = base();
    expect(mergeData(a, b).items.some((i) => i.id === "tech-tapping")).toBe(false);
    b.items = b.items.map((i) => (i.id === "tech-tapping" ? { ...i, updatedAt: 900 } : i));
    expect(mergeData(a, b).items.some((i) => i.id === "tech-tapping")).toBe(true);
  });
  it("keeps the newer practice settings", () => {
    const a = { ...base(), practice: { ...DEFAULT_PRACTICE, maxNew: 3 }, practiceUpdatedAt: 10 };
    const b = { ...base(), practice: { ...DEFAULT_PRACTICE, maxNew: 1 }, practiceUpdatedAt: 20 };
    expect(mergeData(a, b).practice.maxNew).toBe(1);
    expect(mergeData(b, a).practice.maxNew).toBe(1);
  });
});
