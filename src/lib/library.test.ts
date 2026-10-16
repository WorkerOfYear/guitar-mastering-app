import { describe, expect, it } from "vitest";
import { addBlockPatch, blocksOf, isMastered, masteredPatch, materialsOf, removeBlockPatch, tabOf } from "./library";
import type { Item } from "@/shared/types";

const item = (p: Partial<Item>): Item => ({ id: "a", type: "technique", title: "A", status: "active", links: [], createdAt: 0, ...p });

describe("library", () => {
  it("splits songs from exercises", () => {
    expect(tabOf(item({ type: "song" }))).toBe("pieces");
    for (const type of ["technique", "lick", "theory"] as const) expect(tabOf(item({ type }))).toBe("exercises");
  });

  it("a piece is mastered only when every section is", () => {
    const sec = (id: string, status: "active" | "rotation") => ({ id, title: id, status });
    expect(isMastered(item({ type: "song", sections: [sec("a", "rotation"), sec("b", "active")] }))).toBe(false);
    expect(isMastered(item({ type: "song", sections: [sec("a", "rotation"), sec("b", "rotation")] }))).toBe(true);
    expect(isMastered(item({ status: "rotation" }))).toBe(true);
  });

  it("marking a piece covers its sections", () => {
    const song = item({ type: "song", sections: [{ id: "a", title: "a", status: "queue" }] });
    const done = { ...song, ...masteredPatch(song, true) };
    expect(isMastered(done)).toBe(true);
    expect(isMastered({ ...done, ...masteredPatch(done, false) })).toBe(false);
  });

  it("an old exercise gets its blocks from its fields", () => {
    expect(blocksOf(item({}))).toEqual([]);
    const old = item({ video: { youtubeId: "x" }, tab: "...", theory: { tab: "scale", tonic: "A" }, targetBpm: 120, description: "d" });
    expect(blocksOf(old)).toEqual(["video", "score", "board", "metronome", "notes"]);
  });

  it("adds and removes blocks", () => {
    let ex = item({});
    ex = { ...ex, ...addBlockPatch(ex, "board") };
    ex = { ...ex, ...addBlockPatch(ex, "metronome") };
    expect(ex.blocks).toEqual(["board", "metronome"]);
    expect(ex.targetBpm).toBe(120);
    ex = { ...ex, ...removeBlockPatch(ex, "metronome"), targetBpm: 140 };
    expect(ex.blocks).toEqual(["board"]);
    // What the block held stays: adding it back brings the tempo back.
    expect({ ...ex, ...addBlockPatch(ex, "metronome") }.targetBpm).toBe(140);
    // An empty block list stays empty instead of falling back to the fields.
    ex = { ...ex, ...removeBlockPatch(ex, "board"), video: { youtubeId: "x" } };
    expect(blocksOf(ex)).toEqual([]);
  });

  it("an exercise opens its materials in block order", () => {
    const theory = { tab: "chord" as const, tonic: "C" };
    expect(materialsOf(item({ theory, video: { youtubeId: "x" }, blocks: ["board", "metronome", "video"] }))).toEqual(["board", "video"]);
    // A block with nothing in it yet isn't something to play.
    expect(materialsOf(item({ blocks: ["video", "score"] }))).toEqual([]);
  });

  it("a piece opens a tab with its recording first", () => {
    const synced = { tabFile: { name: "a.gp", size: 1 }, audioFile: { name: "a.mp3", size: 1 } };
    expect(materialsOf(item({ type: "song", video: { youtubeId: "x" }, ...synced }))).toEqual(["score", "video"]);
    expect(materialsOf(item({ type: "song", video: { youtubeId: "x" }, tab: "..." }))).toEqual(["video", "score"]);
  });
});
