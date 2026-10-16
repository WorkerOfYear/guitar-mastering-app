import type { BlockId, Item } from "@/shared/types";

export type LibraryTab = "exercises" | "pieces";

/** Songs are "pieces"; everything else is an exercise. */
export const tabOf = (item: Item): LibraryTab => (item.type === "song" ? "pieces" : "exercises");
export const isExercise = (item: Item) => tabOf(item) === "exercises";

/** "Разобрано" is the user's own mark: the item (or every section of a piece) is in rotation. */
export function isMastered(item: Item): boolean {
  return item.sections?.length ? item.sections.every((s) => s.status === "rotation") : item.status === "rotation";
}

/** The edit that marks an item (and all its sections) as learned, or sends it back to work. */
export function masteredPatch(item: Item, on: boolean): Partial<Item> {
  const status = on ? "rotation" : "active";
  return { status, ...(item.sections?.length ? { sections: item.sections.map((s) => ({ ...s, status })) } : {}) };
}

const hasScore = (item: Item) => !!(item.tab || item.tabFile || item.audioFile);
const hasTempo = (item: Item) => item.startBpm != null || item.targetBpm != null;

/**
 * An item's blocks: its own list, or (made before blocks existed) whatever its fields hold.
 * A piece keeps its recording as a block of its own ("Запись"); an exercise's recording belongs to its notes.
 */
export function blocksOf(item: Item): BlockId[] {
  if (item.blocks) return item.blocks;
  const list: BlockId[] = [];
  if (item.video) list.push("video");
  if (!isExercise(item)) {
    if (item.audioFile) list.push("audio");
    if (item.tab || item.tabFile) list.push("score");
    if (item.theory) list.push("board");
    if (item.notes || item.description) list.push("notes");
    return list;
  }
  if (hasScore(item)) list.push("score");
  if (item.theory) list.push("board");
  if (hasTempo(item)) list.push("metronome");
  if (item.notes || item.description) list.push("notes");
  return list;
}

export const hasBlock = (item: Item, id: BlockId) => blocksOf(item).includes(id);

/** Adds a block at the end, with sensible starting values. */
export function addBlockPatch(item: Item, id: BlockId): Partial<Item> {
  const blocks = [...blocksOf(item).filter((b) => b !== id), id];
  switch (id) {
    case "metronome":
      return { blocks, startBpm: item.startBpm ?? 60, targetBpm: item.targetBpm ?? 120 };
    case "notes":
      return { blocks, notes: item.notes ?? item.description ?? "" };
    default:
      return { blocks };
  }
}

/**
 * Removes a block (no questions asked). What it held stays in the item and on the device, unused while the
 * block is gone, so adding the block back brings it all back.
 */
export function removeBlockPatch(item: Item, id: BlockId): Partial<Item> {
  return { blocks: blocksOf(item).filter((b) => b !== id) };
}

/** What an item can be played with in a session; the first one is what opens. */
export type Material = "video" | "score" | "board";

export const MATERIAL_LABEL: Record<Material, string> = { video: "Видео", score: "Ноты", board: "Гриф" };

/**
 * Materials in the order they open. An exercise follows its blocks. A piece opens on a tab with its
 * recording first (the notes follow the sound), then the video, then the tab or recording alone.
 */
export function materialsOf(item: Item): Material[] {
  if (isExercise(item))
    return blocksOf(item).filter(
      (b): b is Material => (b === "video" && !!item.video) || (b === "score" && hasScore(item)) || (b === "board" && !!item.theory),
    );
  const b = blocksOf(item);
  const tab = b.includes("score") && !!(item.tab || item.tabFile);
  const recording = b.includes("audio") && !!item.audioFile;
  const list: Material[] = [];
  if (tab && item.audioFile) list.push("score");
  if (b.includes("video") && item.video) list.push("video");
  if ((tab || recording) && !list.includes("score")) list.push("score");
  if (b.includes("board") && item.theory) list.push("board");
  return list;
}

/** Plays along with the metronome: an exercise only when it has the block, a piece when nothing else plays. */
export const withMetronome = (item: Item) => (isExercise(item) ? hasBlock(item, "metronome") : true);

/**
 * The description and notes shown in a session. An exercise shows its "Заметки" block (which took over the
 * old description) only while it has that block; a piece shows both fields as they are.
 */
export function shownText(item: Item): { description?: string; notes?: string } {
  if (!isExercise(item)) return { description: item.description, notes: item.notes };
  return hasBlock(item, "notes") ? { notes: item.notes || item.description } : {};
}

/** A name for an exercise left untitled: "Упражнение 7". */
export const defaultExerciseTitle = (items: Item[]) => `Упражнение ${items.filter(isExercise).length + 1}`;
