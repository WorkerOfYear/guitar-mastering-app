import { Flame, Guitar, Music2, Puzzle, Repeat, Spline, GraduationCap, Zap, type LucideIcon } from "lucide-react";
import type { BlockKind, ItemType } from "@/shared/types";

/** Icons for blocks and item types; the emoji in BLOCK_META/TYPE_META stay for bot messages. */
export const BLOCK_ICON: Record<BlockKind, LucideIcon> = {
  warmup: Flame,
  new: Puzzle,
  review: Repeat,
  improv: Guitar,
};

export const TYPE_ICON: Record<ItemType, LucideIcon> = {
  technique: Zap,
  song: Music2,
  lick: Spline,
  theory: GraduationCap,
};

/** Tinted rounded square with an icon — used in lists and plan cards. */
export function IconTile({ icon: Icon, className = "" }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent ${className}`}>
      <Icon className="size-5" />
    </span>
  );
}
