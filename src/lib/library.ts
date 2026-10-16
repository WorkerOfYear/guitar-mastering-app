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

/** An exercise's blocks: its own list, or (made before blocks existed) whatever its fields hold. */
export function blocksOf(item: Item): BlockId[] {
  if (item.blocks) return item.blocks;
  const list: BlockId[] = [];
  if (item.video) list.push("video");
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
      return { blocks, startBpm: item.startBpm ?? 60, targetBpm: item.targetBpm ?? 120, subdivision: item.subdivision ?? 4 };
    case "notes":
      return { blocks, notes: item.notes ?? item.description ?? "" };
    default:
      return { blocks };
  }
}

/**
 * Removes a block. Light settings are cleared; files (notes, recordings, takes) stay on the device,
 * so adding the block back brings them back.
 */
export function removeBlockPatch(item: Item, id: BlockId): Partial<Item> {
  const blocks = blocksOf(item).filter((b) => b !== id);
  switch (id) {
    case "video":
      return { blocks, video: undefined };
    case "board":
      return { blocks, theory: undefined };
    case "metronome":
      return { blocks, startBpm: null, targetBpm: null, subdivision: undefined };
    case "notes":
      return { blocks, notes: undefined, description: undefined };
    default:
      return { blocks };
  }
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
  const list: Material[] = [];
  if (item.tabFile && item.audioFile) list.push("score");
  if (item.video) list.push("video");
  if (hasScore(item) && !list.includes("score")) list.push("score");
  if (item.theory) list.push("board");
  return list;
}

/** Plays along with the metronome: an exercise only when it has the block, a piece when nothing else plays. */
export const withMetronome = (item: Item) => (isExercise(item) ? hasBlock(item, "metronome") : true);

/** A name for an exercise left untitled: "Упражнение 7". */
export const defaultExerciseTitle = (items: Item[]) => `Упражнение ${items.filter(isExercise).length + 1}`;
