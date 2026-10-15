import type { Item } from "@/shared/types";

export type LibraryTab = "exercises" | "pieces";

/** Songs are "pieces"; techniques, licks and theory drills are "exercises". */
export const tabOf = (item: Item): LibraryTab => (item.type === "song" ? "pieces" : "exercises");

/** "Разобрано" is the user's own mark: the item (or every section of a piece) is in rotation. */
export function isMastered(item: Item): boolean {
  return item.sections?.length ? item.sections.every((s) => s.status === "rotation") : item.status === "rotation";
}

/** The edit that marks an item (and all its sections) as learned, or sends it back to work. */
export function masteredPatch(item: Item, on: boolean): Partial<Item> {
  const status = on ? "rotation" : "active";
  return { status, ...(item.sections?.length ? { sections: item.sections.map((s) => ({ ...s, status })) } : {}) };
}

/** What an exercise can be played with in a session; the first one is what opens. */
export type Material = "video" | "notes" | "board";

export const MATERIAL_LABEL: Record<Material, string> = { video: "Видео", notes: "Таб", board: "Гриф" };

/**
 * Materials in the order they open. Notes are the tab (alphaTex or a Guitar Pro file) or a recording;
 * a tab with its recording goes first since the notes follow the sound.
 */
export function materialsOf(item: Item): Material[] {
  const notes = !!(item.tab || item.tabFile || item.audioFile);
  const list: Material[] = [];
  if (item.tabFile && item.audioFile) list.push("notes");
  if (item.video) list.push("video");
  if (notes && !list.includes("notes")) list.push("notes");
  if (item.theory) list.push("board");
  return list;
}
