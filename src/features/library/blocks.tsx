import { useState, type ReactNode } from "react";
import { ChevronDown, FileMusic, Headphones, Grid3x3, Metronome, Mic, NotebookPen, Plus, Trash2, Video, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import type { BlockId } from "@/shared/types";

// An exercise is put together from blocks, like a construction kit. A new kind of block is one entry here,
// plus its editor (ItemBlocks for the card, NewExercisePage for the form).

export const BLOCK_META: Record<BlockId, { title: string; icon: LucideIcon; hint: string }> = {
  video: { title: "Видео", icon: Video, hint: "Играть вместе с роликом YouTube или Instagram" },
  audio: { title: "Запись", icon: Headphones, hint: "mp3 оригинала — играть под него, ноты пойдут следом" },
  score: { title: "Табы и ноты", icon: FileMusic, hint: "Guitar Pro или MusicXML — играют с курсором и звуком" },
  board: { title: "Гриф", icon: Grid3x3, hint: "Гамма, лад или аккорд по позициям" },
  metronome: { title: "Метроном", icon: Metronome, hint: "Темп: с какого начать и к какому прийти" },
  notes: { title: "Заметки", icon: NotebookPen, hint: "Мысли по ходу: что получается, где ошибаешься" },
  recorder: { title: "Запись игры", icon: Mic, hint: "Записывай себя на занятии и слушай потом" },
};

/** How many "add" chips show before "Ещё…": always this many while that many blocks are left to add. */
const SHOWN = 4;

/** What each kind of item is built from, in the order the chips offer them. */
export const EXERCISE_BLOCKS: BlockId[] = ["video", "score", "board", "metronome", "notes", "recorder"];
export const PIECE_BLOCKS: BlockId[] = ["video", "score", "notes", "recorder"];

/**
 * Chips for the blocks not added yet, in a fixed order: the first four, then "Ещё…", which unfolds
 * the rest right here in the row. Adding one pulls the next one up, so there are always four.
 */
export function BlockPicker({ have, onAdd, from = EXERCISE_BLOCKS }: { have: BlockId[]; onAdd: (id: BlockId) => void; from?: BlockId[] }) {
  const [all, setAll] = useState(false);
  const missing = from.filter((b) => !have.includes(b));
  if (!missing.length) return null;
  const shown = all ? missing : missing.slice(0, SHOWN);
  return (
    <div className="flex flex-wrap gap-2">
      {shown.map((id) => {
        const Icon = BLOCK_META[id].icon;
        return (
          <AddChip
            key={id}
            hint={BLOCK_META[id].hint}
            onClick={() => {
              haptic();
              onAdd(id);
            }}
          >
            <Icon /> {BLOCK_META[id].title}
          </AddChip>
        );
      })}
      {shown.length < missing.length && (
        <AddChip
          plain
          onClick={() => {
            haptic();
            setAll(true);
          }}
        >
          Ещё…
        </AddChip>
      )}
    </div>
  );
}

function AddChip({ onClick, plain, hint, children }: { onClick: () => void; plain?: boolean; hint?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      className="flex h-10 items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-[0.97] [&_svg]:size-4"
    >
      {!plain && <Plus className="!size-3.5" />}
      {children}
    </button>
  );
}

/**
 * One block: a header row (its icon, name and, when folded, a one-line summary), then its content.
 * With `onToggle` it folds (the card starts with every block folded); the form keeps blocks open.
 * The bin sits in the same spot on every block, folded or open, just left of the fold arrow,
 * and removes the block at once.
 */
export function BlockShell({
  id,
  onRemove,
  open = true,
  onToggle,
  summary,
  children,
}: {
  id: BlockId;
  onRemove: () => void;
  open?: boolean;
  onToggle?: () => void;
  summary?: string;
  children: ReactNode;
}) {
  const Icon = BLOCK_META[id].icon;
  const title = BLOCK_META[id].title;
  const head = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {!open && summary && <span className="block truncate text-xs text-muted">{summary}</span>}
      </span>
    </>
  );
  return (
    <section className={cn("rounded-3xl border bg-surface transition-colors", open && onToggle ? "border-accent/60" : "border-line")}>
      <div className="flex min-h-14 items-center pr-2">
        {onToggle ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              haptic();
              onToggle();
            }}
            className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-3xl py-2 pl-3 text-left"
          >
            {head}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3">{head}</div>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={`Убрать блок «${title}»`} onClick={onRemove} className="size-9 text-muted hover:text-guide">
          <Trash2 className="size-4" />
        </Button>
        {onToggle && (
          <Button variant="ghost" size="icon-sm" aria-label={open ? "Свернуть" : "Развернуть"} onClick={onToggle} className="size-9">
            <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
          </Button>
        )}
      </div>
      {open && <div className="space-y-3 border-t border-line/70 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}
