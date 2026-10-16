import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FileMusic, Grid3x3, Metronome, Mic, NotebookPen, Plus, Trash2, Video, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import type { BlockId } from "@/shared/types";

// An exercise is put together from blocks, like a construction kit. A new kind of block is one entry here,
// plus its editor (ExerciseBlocks for the card, NewExercisePage for the form).

export const BLOCK_META: Record<BlockId, { title: string; icon: LucideIcon; hint: string }> = {
  video: { title: "Видео", icon: Video, hint: "Играть вместе с роликом YouTube" },
  score: { title: "Ноты", icon: FileMusic, hint: "Guitar Pro или MusicXML — играют с курсором и звуком" },
  board: { title: "Гриф", icon: Grid3x3, hint: "Гамма, лад или аккорд по позициям" },
  metronome: { title: "Метроном", icon: Metronome, hint: "Темп: с какого начать и к какому прийти" },
  notes: { title: "Заметки", icon: NotebookPen, hint: "Мысли по ходу: что получается, где ошибаешься" },
  recorder: { title: "Запись игры", icon: Mic, hint: "Записывай себя на занятии и слушай потом" },
};

/** Shown as chips under the blocks; the rest are behind "Ещё…". */
const PINNED: BlockId[] = ["video", "score", "board", "metronome"];
const ALL = Object.keys(BLOCK_META) as BlockId[];

/** Chips for the main blocks not added yet, and "Ещё…" with the whole list. */
export function BlockPicker({ have, onAdd }: { have: BlockId[]; onAdd: (id: BlockId) => void }) {
  const [sheet, setSheet] = useState(false);
  const missing = ALL.filter((b) => !have.includes(b));
  const chips = PINNED.filter((b) => missing.includes(b));
  const more = missing.some((b) => !PINNED.includes(b));
  if (!missing.length) return null;
  const add = (id: BlockId) => {
    haptic();
    setSheet(false);
    onAdd(id);
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {chips.map((id) => {
          const Icon = BLOCK_META[id].icon;
          return (
            <AddChip key={id} onClick={() => add(id)}>
              <Icon /> {BLOCK_META[id].title}
            </AddChip>
          );
        })}
        {more && (
          <AddChip onClick={() => setSheet(true)} plain>
            Ещё…
          </AddChip>
        )}
      </div>
      <Drawer open={sheet} onOpenChange={setSheet}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Добавить блок</DrawerTitle>
            <DrawerDescription>Из блоков складывается упражнение</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-1 pb-2">
            {missing.map((id) => {
              const Icon = BLOCK_META[id].icon;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => add(id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors active:bg-surface-2 hover:bg-surface-2/60"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{BLOCK_META[id].title}</span>
                    <span className="block text-xs text-muted">{BLOCK_META[id].hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function AddChip({ onClick, plain, children }: { onClick: () => void; plain?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
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
 * The bin sits in the same spot on every block, folded or open, just left of the fold arrow;
 * tapping it asks once more right in the header.
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
  const [confirm, setConfirm] = useState(false);
  const Icon = BLOCK_META[id].icon;
  const title = BLOCK_META[id].title;
  const head = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {confirm ? (
          <span className="block truncate text-xs text-guide">Убрать блок?</span>
        ) : (
          !open && summary && <span className="block truncate text-xs text-muted">{summary}</span>
        )}
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
              setConfirm(false);
              onToggle();
            }}
            className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-3xl py-2 pl-3 text-left"
          >
            {head}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3">{head}</div>
        )}
        {confirm ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} className="h-9 px-3">
              Нет
            </Button>
            <Button variant="destructive" size="sm" onClick={onRemove} className="h-9 px-3">
              Убрать
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon-sm" aria-label={`Убрать блок «${title}»`} onClick={() => setConfirm(true)} className="size-9 text-muted hover:text-guide">
              <Trash2 className="size-4" />
            </Button>
            {onToggle && (
              <Button variant="ghost" size="icon-sm" aria-label={open ? "Свернуть" : "Развернуть"} onClick={onToggle} className="size-9">
                <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
              </Button>
            )}
          </>
        )}
      </div>
      {open && <div className="space-y-3 border-t border-line/70 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}
