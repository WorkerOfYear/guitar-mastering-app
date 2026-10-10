import { addDays } from "./date";
import type { Item, PlanEntry, Section, TempoEntry } from "@/shared/types";

export const entryKey = (e: PlanEntry) => (e.sectionId ? `${e.itemId}#${e.sectionId}` : e.itemId);

const sameUnit = (t: TempoEntry, e: PlanEntry) => t.itemId === e.itemId && (t.sectionId ?? undefined) === (e.sectionId ?? undefined);

export const entriesFor = (log: TempoEntry[], e: PlanEntry) => log.filter((t) => sameUnit(t, e));

/** Best tempo played clean in the last 14 days; falls back to the latest clean tempo ever. */
export function cleanBpm(log: TempoEntry[], e: PlanEntry, today: string): number | null {
  const clean = entriesFor(log, e).filter((t) => t.result === "clean" && t.bpm);
  if (!clean.length) return null;
  const since = addDays(today, -13);
  const recent = clean.filter((t) => t.date >= since);
  if (recent.length) return Math.max(...recent.map((t) => t.bpm!));
  return clean.reduce((a, b) => (b.at > a.at ? b : a)).bpm;
}

export const lastEntry = (log: TempoEntry[], e: PlanEntry) =>
  entriesFor(log, e).reduce<TempoEntry | null>((a, b) => (!a || b.at > a.at ? b : a), null);

export const findSection = (item: Item | undefined, sectionId?: string): Section | undefined =>
  sectionId ? item?.sections?.find((s) => s.id === sectionId) : undefined;

export const targetBpm = (item: Item | undefined, sectionId?: string) => findSection(item, sectionId)?.targetBpm ?? item?.targetBpm ?? null;

/** Tempo the metronome starts at: last clean tempo, else the last one tried, else the item's start tempo. */
export function startingBpm(log: TempoEntry[], item: Item | undefined, e: PlanEntry, today: string) {
  return cleanBpm(log, e, today) ?? lastEntry(log, e)?.bpm ?? item?.startBpm ?? 80;
}

export const unitTitle = (item: Item | undefined, sectionId?: string) => {
  if (!item) return "Удалённый элемент";
  const s = findSection(item, sectionId);
  return s ? `${item.title}: ${s.title}` : item.title;
};
