import { Link, useSearchParams } from "react-router-dom";
import { m } from "motion/react";
import { Check, ChevronRight, Dumbbell, Inbox, Pin, Plus } from "lucide-react";
import { Button, Card, Chip, Progress, Segmented } from "@/components/ui";
import { TYPE_ICON, IconTile } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { cleanBpm, targetBpm } from "@/lib/progress";
import { localDate } from "@/lib/date";
import { blocksOf, isMastered, tabOf, type LibraryTab } from "@/lib/library";
import { BLOCK_META } from "./blocks";
import { useData } from "@/store/data";
import type { Item } from "@/shared/types";

/** Under the title: just what the item is made of ("Видео · Гриф · Метроном"); nothing when it has no blocks yet. */
const subtitle = (item: Item) => blocksOf(item).map((b) => BLOCK_META[b].title).join(" · ");

type Filter = "all" | "open" | "done";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "open", label: "В работе" },
  { value: "done", label: "Разобрано" },
];

/** Two shelves: exercises and pieces. Pieces carry the user's own "Разобрано" mark; the planner decides what goes into a session. */
export function LibraryPage() {
  const { items: all, log } = useData();
  const today = localDate();
  const [params, setParams] = useSearchParams();
  const tab: LibraryTab = params.get("tab") === "pieces" ? "pieces" : "exercises";
  const pieces = tab === "pieces";
  // Exercises are just a list; only pieces are marked learned and filtered by it.
  const filter = (pieces && ["open", "done"].includes(params.get("show") ?? "") ? params.get("show") : "all") as Filter;
  const setQuery = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
        return next;
      },
      { replace: true },
    );

  const shelf = all.filter((i) => tabOf(i) === tab && i.status !== "archived" && !i.warmup);
  const doneCount = shelf.filter(isMastered).length;
  const items = shelf.filter((i) => (filter === "all" ? true : filter === "done" ? isMastered(i) : !isMastered(i)));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Библиотека"
        action={
          <Button asChild className="h-11">
            <Link to={tab === "pieces" ? "/library/new/piece" : "/library/new/exercise"}>
              <Plus /> {tab === "pieces" ? "Произведение" : "Упражнение"}
            </Link>
          </Button>
        }
      />
      <Segmented
        value={tab}
        onChange={(v) => setQuery({ tab: v === "pieces" ? v : null, show: null })}
        options={[
          { value: "exercises", label: "Упражнения" },
          { value: "pieces", label: "Произведения" },
        ]}
      />
      {pieces && shelf.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <Chip key={f.value} active={filter === f.value} onClick={() => setQuery({ show: f.value === "all" ? null : f.value })}>
                {f.label}
              </Chip>
            ))}
          </div>
          <span className="shrink-0 text-xs text-muted tabular-nums">
            разобрано {doneCount} из {shelf.length}
          </span>
        </div>
      )}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
          <Inbox className="size-10 opacity-50" />
          {shelf.length ? "Ничего подходящего" : tab === "pieces" ? "Произведений пока нет" : "Упражнений пока нет"}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            // Tempo progress is for later; for now only pieces show it.
            const clean = pieces ? cleanBpm(log, { itemId: item.id }, today) : null;
            const target = pieces ? targetBpm(item) : null;
            const mastered = pieces && isMastered(item);
            return (
              <m.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <Link to={`/library/${item.id}`} className="block">
                  <Card className="flex items-center gap-3 p-3 transition-transform active:scale-[0.99]">
                    <IconTile icon={tabOf(item) === "exercises" ? Dumbbell : TYPE_ICON[item.type]} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate font-semibold">
                        {item.pinned && <Pin className="size-3.5 shrink-0 text-accent" />}
                        <span className="truncate">{item.title}</span>
                      </div>
                      {subtitle(item) && <div className="truncate text-xs text-muted">{subtitle(item)}</div>}
                      {target ? <Progress className="mt-2 h-1.5" value={((clean ?? 0) / target) * 100} /> : null}
                    </div>
                    {target ? (
                      <div className="shrink-0 text-right text-sm tabular-nums">
                        <b>{clean ?? "—"}</b>
                        <span className="text-muted">/{target}</span>
                      </div>
                    ) : null}
                    {mastered ? <Check className="size-5 shrink-0 text-good" aria-label="Разобрано" /> : null}
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </Card>
                </Link>
              </m.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
