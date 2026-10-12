import { Link } from "react-router-dom";
import { m } from "motion/react";
import { ChevronRight, Inbox, Pin, Plus } from "lucide-react";
import { Button, Card, Progress } from "@/components/ui";
import { TYPE_ICON, IconTile } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { cleanBpm, targetBpm } from "@/lib/progress";
import { localDate } from "@/lib/date";
import { useData } from "@/store/data";
import { TYPE_META } from "@/shared/types";

/** Everything in one plain list; what goes into a session is decided by the planner. */
export function LibraryPage() {
  const { items, log } = useData();
  const today = localDate();

  return (
    <div className="space-y-3">
      <PageHeader
        title="Библиотека"
        action={
          <Button asChild className="h-11">
            <Link to="/library/new">
              <Plus /> Добавить
            </Link>
          </Button>
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
          <Inbox className="size-10 opacity-50" />
          Здесь пока пусто
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            const clean = cleanBpm(log, { itemId: item.id }, today);
            const target = targetBpm(item);
            const sections = item.sections ?? [];
            const done = sections.filter((s) => s.status === "rotation").length;
            return (
              <m.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <Link to={`/library/${item.id}`} className="block">
                  <Card className="flex items-center gap-3 p-3 transition-transform active:scale-[0.99]">
                    <IconTile icon={TYPE_ICON[item.type]} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate font-semibold">
                        {item.pinned && <Pin className="size-3.5 shrink-0 text-accent" />}
                        <span className="truncate">{item.title}</span>
                      </div>
                      <div className="truncate text-xs text-muted">
                        {sections.length ? `Разделы: ${done} из ${sections.length} выучено` : (item.category ?? TYPE_META[item.type].title)}
                      </div>
                      {target ? <Progress className="mt-2 h-1.5" value={((clean ?? 0) / target) * 100} /> : null}
                    </div>
                    {target ? (
                      <div className="shrink-0 text-right text-sm tabular-nums">
                        <b>{clean ?? "—"}</b>
                        <span className="text-muted">/{target}</span>
                      </div>
                    ) : null}
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
