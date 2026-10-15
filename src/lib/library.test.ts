import { describe, expect, it } from "vitest";
import { isMastered, masteredPatch, materialsOf, tabOf } from "./library";
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

  it("lists what an exercise is played with, in the order it opens", () => {
    expect(materialsOf(item({}))).toEqual([]);
    expect(materialsOf(item({ theory: { tab: "scale", tonic: "A" } }))).toEqual(["board"]);
    expect(materialsOf(item({ video: { youtubeId: "x" }, tab: "...", theory: { tab: "chord", tonic: "C" } }))).toEqual(["video", "notes", "board"]);
    const synced = { tabFile: { name: "a.gp", size: 1 }, audioFile: { name: "a.mp3", size: 1 } };
    expect(materialsOf(item({ video: { youtubeId: "x" }, ...synced }))).toEqual(["notes", "video"]);
  });
});
