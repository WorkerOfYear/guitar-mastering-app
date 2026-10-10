import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, Chip, ScrollRow, Segmented } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";
import { cleanBpm, targetBpm } from "@/lib/progress";
import { localDate } from "@/lib/date";
import { useData } from "@/store/data";
import { STATUS_META, TYPE_META, type Item, type ItemStatus, type ItemType } from "@/shared/types";

const STATUSES: ItemStatus[] = ["active", "queue", "rotation", "archived"];
const TYPES: (ItemType | "all")[] = ["all", "technique", "song", "lick", "theory"];

export function LibraryPage() {
  const items = useData((s) => s.items);
  const [status, setStatus] = useState<ItemStatus>("active");
  const [type, setType] = useState<ItemType | "all">("all");
  const list = items.filter((i) => i.status === status && (type === "all" || i.type === type));
  const warmup = list.filter((i) => i.warmup);
  const rest = list.filter((i) => !i.warmup);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Библиотека"
        action={
          <Link to="/library/new" className="flex h-11 items-center rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent">
            + Добавить
          </Link>
        }
      />
      <Segmented
        size="sm"
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({ value: s, label: `${STATUS_META[s].title} ${items.filter((i) => i.status === s).length}` }))}
      />
      <ScrollRow>
        {TYPES.map((t) => (
          <Chip key={t} active={t === type} onClick={() => setType(t)}>
            {t === "all" ? "Все" : `${TYPE_META[t].icon} ${TYPE_META[t].title}`}
          </Chip>
        ))}
      </ScrollRow>
      {warmup.length > 0 && <ItemList title="Разминка" items={warmup} />}
      <ItemList title={warmup.length ? "Остальное" : undefined} items={rest} />
      {list.length === 0 && <p className="py-8 text-center text-sm text-muted">Здесь пока пусто</p>}
    </div>
  );
}

function ItemList({ title, items }: { title?: string; items: Item[] }) {
  const log = useData((s) => s.log);
  const today = localDate();
  if (!items.length) return null;
  return (
    <div>
      {title && <h2 className="px-1 pb-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>}
      <div className="space-y-2">
        {items.map((item) => {
          const clean = cleanBpm(log, { itemId: item.id }, today);
          const target = targetBpm(item);
          const sections = item.sections ?? [];
          const done = sections.filter((s) => s.status === "rotation").length;
          return (
            <Link key={item.id} to={`/library/${item.id}`} className="block">
              <Card className="flex items-center gap-3 active:scale-[0.99]">
                <span className="text-2xl">{TYPE_META[item.type].icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {item.pinned && "📌 "}
                    {item.title}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {sections.length ? `Разделы: ${done} из ${sections.length} выучено` : (item.category ?? TYPE_META[item.type].title)}
                  </div>
                  {target ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ((clean ?? 0) / target) * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
                {target ? (
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    <b>{clean ?? "—"}</b>
                    <span className="text-muted">/{target}</span>
                  </div>
                ) : null}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
