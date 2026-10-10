import { randomTask } from "@/music/improv";
import { entryKey } from "@/lib/progress";
import type { DataState } from "@/store/data";
import type { Item, PlanBlock, PlanEntry } from "@/shared/types";

type PlanInput = Pick<DataState, "items" | "lastPlayed" | "recentKeys" | "practice">;

/** Never-played first, then the longest ago. */
const byLastPlayed = (lastPlayed: Record<string, string>) => (a: PlanEntry, b: PlanEntry) =>
  (lastPlayed[entryKey(a)] ?? "").localeCompare(lastPlayed[entryKey(b)] ?? "");

/** Practice units of an item in the given status: sections for songs, the item itself otherwise. */
function units(item: Item, status: "active" | "rotation"): PlanEntry[] {
  if (item.sections?.length) {
    const own = item.sections.filter((s) => s.status === status).map((s) => ({ itemId: item.id, sectionId: s.id }));
    if (own.length || status === "rotation") return own;
    // An active song with no active section: take the first section not yet learned.
    if (item.status !== "active") return [];
    const next = item.sections.find((s) => s.status === "queue") ?? item.sections.find((s) => s.status !== "rotation" && s.status !== "archived");
    return next ? [{ itemId: item.id, sectionId: next.id }] : [];
  }
  return item.status === status ? [{ itemId: item.id }] : [];
}

export function buildPlan(input: PlanInput, rnd = Math.random): PlanBlock[] {
  const { items, lastPlayed, practice } = input;
  const live = items.filter((i) => i.status !== "archived");
  const order = byLastPlayed(lastPlayed);

  const warmup = live.filter((i) => i.warmup).map((i) => ({ itemId: i.id }));

  const study = live.filter((i) => !i.warmup);
  const activeUnits = study.filter((i) => i.status === "active").flatMap((i) => units(i, "active")).sort(order);
  const fresh = activeUnits.slice(0, practice.maxNew);

  const reviewCount = Math.max(1, Math.floor(practice.blocks.review / practice.minutesPerReview));
  const rotation = study.filter((i) => i.status !== "queue").flatMap((i) => units(i, "rotation"));
  const pinned = rotation.filter((e) => items.find((i) => i.id === e.itemId)?.pinned).sort(order);
  const rest = rotation.filter((e) => !pinned.includes(e)).sort(order);
  let review = [...pinned, ...rest].slice(0, reviewCount);
  if (!review.length) {
    const taken = new Set(fresh.map(entryKey));
    review = activeUnits.filter((e) => !taken.has(entryKey(e))).slice(0, reviewCount);
  }

  return [
    { kind: "warmup", minutes: practice.blocks.warmup, entries: warmup },
    { kind: "new", minutes: practice.blocks.new, entries: fresh },
    { kind: "review", minutes: practice.blocks.review, entries: review },
    { kind: "improv", minutes: practice.blocks.improv, entries: [], improv: randomTask({ recentKeys: input.recentKeys, rnd }) },
  ];
}
