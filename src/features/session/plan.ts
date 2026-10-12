import { randomTask } from "@/music/improv";
import { entryKey } from "@/lib/progress";
import type { DataState } from "@/store/data";
import type { Item, PlanBlock, PlanEntry, PlanTemplate } from "@/shared/types";

export const WARMUP_CATEGORY = "Разминка";

type PlanInput = Pick<DataState, "items" | "lastPlayed" | "recentKeys" | "practice" | "template">;

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

/** Warm-up lasts as long as its exercises (each item's own minutes, 3 by default). */
const warmupLength = (entries: PlanEntry[], items: Item[], fallback: number) =>
  entries.length ? entries.reduce((sum, e) => sum + (items.find((i) => i.id === e.itemId)?.minutes ?? 3), 0) : fallback;

export const templateSize = (t?: PlanTemplate) => (t ? t.warmup.length + t.new.length + t.review.length : 0);

/** The hand-made plan, minus entries whose item or section no longer exists. */
function fromTemplate(input: PlanInput, template: PlanTemplate, rnd: () => number): PlanBlock[] {
  const { items, practice } = input;
  const exists = (e: PlanEntry) => {
    const item = items.find((i) => i.id === e.itemId);
    return !!item && item.status !== "archived" && (!e.sectionId || !!item.sections?.some((s) => s.id === e.sectionId));
  };
  const warmup = template.warmup.filter(exists);
  return [
    { kind: "warmup", minutes: warmupLength(warmup, items, practice.blocks.warmup), entries: warmup },
    { kind: "new", minutes: practice.blocks.new, entries: template.new.filter(exists) },
    { kind: "review", minutes: practice.blocks.review, entries: template.review.filter(exists) },
    { kind: "improv", minutes: practice.blocks.improv, entries: [], improv: randomTask({ recentKeys: input.recentKeys, rnd }) },
  ];
}

export function buildPlan(input: PlanInput, rnd = Math.random): PlanBlock[] {
  if (input.template && templateSize(input.template)) return fromTemplate(input, input.template, rnd);
  const { items, lastPlayed, practice } = input;
  const live = items.filter((i) => i.status !== "archived");
  const order = byLastPlayed(lastPlayed);

  const warmupItems = live.filter((i) => i.warmup);
  const warmup = warmupItems.map((i) => ({ itemId: i.id }));
  const warmupMinutes = warmupLength(warmup, items, practice.blocks.warmup);

  // Warm-up material (category "Разминка") is only ever played in the warm-up, even when switched off there.
  const study = live.filter((i) => !i.warmup && i.category !== WARMUP_CATEGORY);
  const activeUnits = study
    .filter((i) => i.status === "active")
    .flatMap((i) => units(i, "active"))
    .sort(order);
  // Songs are the goal: one slot always goes to a song section when one is in progress.
  const isSong = (e: PlanEntry) => !!e.sectionId;
  const song = activeUnits.find(isSong);
  const fresh = song ? [song, ...activeUnits.filter((e) => e !== song)].slice(0, practice.maxNew).sort(order) : activeUnits.slice(0, practice.maxNew);

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
    { kind: "warmup", minutes: warmupMinutes, entries: warmup },
    { kind: "new", minutes: practice.blocks.new, entries: fresh },
    { kind: "review", minutes: practice.blocks.review, entries: review },
    { kind: "improv", minutes: practice.blocks.improv, entries: [], improv: randomTask({ recentKeys: input.recentKeys, rnd }) },
  ];
}
