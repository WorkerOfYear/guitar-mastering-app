import type { Item, PlanBlock } from "@/shared/types";

// Each exercise in a block gets a time slot; the current exercise follows from the block clock,
// so pausing, skipping and reloading all just move that clock.

const MIN_SLOT = 60;

/** Seconds per entry: items with their own `minutes` keep them, the rest share what's left of the block. */
export function entrySlots(block: PlanBlock, items: Item[], plannedSec: number): number[] {
  if (!block.entries.length) return [plannedSec];
  const own = block.entries.map((e) => items.find((i) => i.id === e.itemId)?.minutes);
  const fixed = own.reduce<number>((sum, m) => sum + (m ? m * 60 : 0), 0);
  const free = own.filter((m) => !m).length;
  const share = free ? Math.max(MIN_SLOT, (Math.min(plannedSec, block.minutes * 60) - fixed) / free) : 0;
  const slots = own.map((m) => (m ? m * 60 : share));
  // Extra time (+5 min) goes to the last exercise.
  const total = slots.reduce((a, b) => a + b, 0);
  if (plannedSec > total) slots[slots.length - 1] += plannedSec - total;
  return slots;
}

export interface Slot {
  index: number;
  start: number;
  end: number;
}

export function slotAt(slots: number[], elapsed: number): Slot {
  let start = 0;
  for (let i = 0; i < slots.length; i++) {
    const end = start + slots[i];
    if (elapsed < end || i === slots.length - 1) return { index: i, start, end };
    start = end;
  }
  return { index: 0, start: 0, end: slots[0] ?? 0 };
}

export const slotStart = (slots: number[], index: number) => slots.slice(0, index).reduce((a, b) => a + b, 0);
