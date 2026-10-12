import { describe, expect, it } from "vitest";
import { mergeData } from "./merge";
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

describe("upgradeStarter", () => {
  it("replaces untouched starter items, keeps edits, adds new ones, skips deleted", async () => {
    const { upgradeStarter } = await import("./data");
    const old: Item[] = STARTER_LIBRARY.filter((i) => i.id !== "wu-video").map((i) => ({ ...i, updatedAt: undefined, tab: undefined, warmup: i.id.startsWith("wu-") }));
    old[0] = { ...old[0], notes: "моё", updatedAt: Date.UTC(2026, 9, 11) };
    const up = upgradeStarter(old, { "song-ascend": 1 });
    expect(up.find((i) => i.id === old[0].id)?.notes).toBe("моё");
    expect(up.find((i) => i.id === "wu-spider")?.tab).toBeTruthy();
    expect(up.find((i) => i.id === "wu-spider")?.warmup).toBeFalsy();
    expect(up.some((i) => i.id === "wu-video")).toBe(true);
    expect(up.filter((i) => i.id === "song-ascend")).toHaveLength(1); // still there: deletion only blocks re-adding missing ones
  });
});
