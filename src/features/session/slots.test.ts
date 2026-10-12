import { describe, expect, it } from "vitest";
import { entrySlots, slotAt, slotStart } from "./slots";
import type { Item, PlanBlock } from "@/shared/types";

const item = (id: string, minutes?: number) => ({ id, minutes }) as Item;
const block = (ids: string[], minutes: number): PlanBlock => ({ kind: "warmup", minutes, entries: ids.map((itemId) => ({ itemId })) });

describe("slots", () => {
  it("uses each exercise's own length", () => {
    expect(entrySlots(block(["a", "b"], 6), [item("a", 3), item("b", 3)], 360)).toEqual([180, 180]);
  });
  it("splits the block evenly when exercises have no length, and gives extra time to the last one", () => {
    expect(entrySlots(block(["a", "b"], 20), [item("a"), item("b")], 1200)).toEqual([600, 600]);
    expect(entrySlots(block(["a", "b"], 20), [item("a"), item("b")], 1500)).toEqual([600, 900]);
    expect(entrySlots(block(["a", "b"], 20), [item("a", 15), item("b")], 1200)).toEqual([900, 300]);
  });
  it("finds the current exercise from the block clock", () => {
    const s = [180, 180, 180];
    expect(slotAt(s, 0)).toEqual({ index: 0, start: 0, end: 180 });
    expect(slotAt(s, 200).index).toBe(1);
    expect(slotAt(s, 9999).index).toBe(2); // overtime stays on the last one
    expect(slotStart(s, 2)).toBe(360);
  });
  it("an empty block is one slot", () => {
    expect(entrySlots({ kind: "improv", minutes: 15, entries: [] }, [], 900)).toEqual([900]);
  });
});
