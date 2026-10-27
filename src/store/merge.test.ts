import { describe, expect, it } from "vitest";
import { mergeData } from "./merge";
import { LEGACY_PLAN_ID } from "./plans";
import { DEFAULT_PRACTICE, type DataState } from "./data";
import { STARTER_LIBRARY } from "@/data/library";
import type { Item } from "@/shared/types";

const base = (): DataState => ({ items: STARTER_LIBRARY, log: [], sessions: [], lastPlayed: {}, recentKeys: [], practice: DEFAULT_PRACTICE, deleted: {} });

describe("mergeData", () => {
  it("a fresh device does not override edits from the other one", () => {
    const remote = base();
    remote.items = remote.items.map((i) => (i.id === "tech-3nps" ? { ...i, targetBpm: 180, updatedAt: 1000 } : i));
    const merged = mergeData(base(), remote);
    expect(merged.items.find((i) => i.id === "tech-3nps")?.targetBpm).toBe(180);
    expect(merged.items).toHaveLength(STARTER_LIBRARY.length);
  });
  it("an edit wins over a newer version of the starter library", () => {
    const old = base();
    old.items = old.items.map((i) => (i.id === "tech-3nps" ? { ...i, targetBpm: 170, updatedAt: Date.UTC(2026, 9, 11) } : i));
    expect(mergeData(base(), old).items.find((i) => i.id === "tech-3nps")?.targetBpm).toBe(170);
    expect(mergeData(old, base()).items.find((i) => i.id === "tech-3nps")?.targetBpm).toBe(170);
    const pristineOld = base();
    pristineOld.items = pristineOld.items.map((i) => ({ ...i, updatedAt: undefined, tab: undefined }));
    expect(mergeData(pristineOld, base()).items.find((i) => i.id === "wu-chromatic")?.tab).toBeTruthy();
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
    a.deleted = { "tech-tapping": Date.UTC(2026, 9, 13) };
    const b = base();
    expect(mergeData(a, b).items.some((i) => i.id === "tech-tapping")).toBe(false);
    b.items = b.items.map((i) => (i.id === "tech-tapping" ? { ...i, updatedAt: Date.UTC(2026, 9, 14) } : i));
    expect(mergeData(a, b).items.some((i) => i.id === "tech-tapping")).toBe(true);
  });
  it("keeps the newer practice settings", () => {
    const a = { ...base(), practice: { ...DEFAULT_PRACTICE, maxNew: 3 }, practiceUpdatedAt: 10 };
    const b = { ...base(), practice: { ...DEFAULT_PRACTICE, maxNew: 1 }, practiceUpdatedAt: 20 };
    expect(mergeData(a, b).practice.maxNew).toBe(1);
    expect(mergeData(b, a).practice.maxNew).toBe(1);
  });
});

describe("plans", () => {
  const p1 = { id: "p1", name: "Утро", warmup: [{ itemId: "a" }], new: [], review: [] };
  const p2 = { id: "p2", name: "Вечер", warmup: [], new: [{ itemId: "b" }], review: [] };

  it("keeps the newer plans and choice from either side", () => {
    const a = { ...base(), plans: [p1], planId: "p1", templateUpdatedAt: 10 };
    const b = { ...base(), plans: [p1, p2], planId: "p2", templateUpdatedAt: 20 };
    for (const m of [mergeData(a, b), mergeData(b, a)]) {
      expect(m.plans).toEqual([p1, p2]);
      expect(m.planId).toBe("p2");
    }
    expect(mergeData(base(), a).plans).toEqual([p1]);
  });

  it("turns the single plan of an older device into a chosen plan", () => {
    const old = { ...base(), template: { warmup: [], new: [{ itemId: "b" }], review: [] }, templateUpdatedAt: 20 };
    const m = mergeData({ ...base(), plans: [p1], planId: "p1", templateUpdatedAt: 10 }, old);
    expect(m.plans).toEqual([{ id: LEGACY_PLAN_ID, name: "Мой план", warmup: [], new: [{ itemId: "b" }], review: [] }]);
    expect(m.planId).toBe(LEGACY_PLAN_ID);
    expect(m.template).toBeUndefined();
  });
});

describe("dropStarter", () => {
  it("removes starter items, edited or not, keeps the user's own, and they stay gone after a sync", async () => {
    const { dropStarter } = await import("./data");
    const mine: Item = { id: "song-mine", type: "song", title: "Моя песня", status: "active", links: [], createdAt: 5, updatedAt: 5 };
    const edited = { ...STARTER_LIBRARY[0], notes: "моё", updatedAt: Date.UTC(2026, 9, 12, 10) };
    const { items, deleted } = dropStarter([edited, ...STARTER_LIBRARY.slice(1), mine], {}, Date.UTC(2026, 9, 13));
    expect(items).toEqual([mine]);
    // A device (or the server) that still has the starter items doesn't bring them back.
    const merged = mergeData({ ...base(), items, deleted }, { ...base(), items: [edited, ...STARTER_LIBRARY.slice(1)] });
    expect(merged.items).toEqual([mine]);
  });
});
