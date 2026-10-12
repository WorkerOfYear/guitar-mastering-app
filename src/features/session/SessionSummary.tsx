import { Link } from "react-router-dom";
import { m } from "motion/react";
import { Check, ListChecks, PartyPopper, Trophy } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { BLOCK_ICON } from "@/components/ui/icons";
import { recordsSince } from "@/lib/stats";
import { unitTitle } from "@/lib/progress";
import { useData } from "@/store/data";
import { useSession } from "@/store/session";
import { BLOCK_META, type SessionLog } from "@/shared/types";

const RESULT = { clean: "чисто", errors: "с ошибками", fail: "не вышло" } as const;

export function SessionSummary({ log }: { log: SessionLog }) {
  const { items, log: tempoLog } = useData();
  const clear = useSession((s) => s.clearFinished);
  const total = Math.round(log.blocks.reduce((s, b) => s + b.actualSec, 0) / 60);
  const records = recordsSince(tempoLog, log.date).filter((r) => r.at >= log.startedAt);
  const played = tempoLog.filter((t) => t.at >= log.startedAt && t.at <= log.endedAt);

  return (
    <div className="space-y-3 pt-6">
      <m.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", bounce: 0.4 }} className="text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent/15 text-accent">
          <PartyPopper className="size-10" />
        </div>
        <h1 className="mt-3 text-2xl font-bold">Занятие завершено</h1>
        <p className="text-muted">
          <span className="text-3xl font-bold tabular-nums text-fg">{total}</span> мин
        </p>
      </m.div>
      <Card className="divide-y divide-line/60 py-1">
        {log.blocks.map((b) => {
          const Icon = BLOCK_ICON[b.kind];
          return (
            <div key={b.kind} className="flex items-center gap-3 py-2.5 text-sm">
              <Icon className="size-4 shrink-0 text-accent" />
              <span className="flex-1">{BLOCK_META[b.kind].title}</span>
              {b.skipped ? (
                <Badge variant="outline">пропущен</Badge>
              ) : (
                <span className="font-semibold tabular-nums">
                  {Math.round(b.actualSec / 60)} / {Math.round(b.plannedSec / 60)} мин
                </span>
              )}
            </div>
          );
        })}
      </Card>
      {records.length > 0 && (
        <Card className="border-accent/40 bg-accent/5">
          <div className="flex items-center gap-2 pb-1 font-bold">
            <Trophy className="size-5 text-accent" /> Новые рекорды
          </div>
          {records.map((r) => (
            <div key={r.at} className="flex justify-between py-1.5 text-sm">
              <span className="truncate pr-2">
                {unitTitle(
                  items.find((i) => i.id === r.itemId),
                  r.sectionId,
                )}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                <span className="text-muted">{r.note} →</span> {r.bpm}
              </span>
            </div>
          ))}
        </Card>
      )}
      {played.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 pb-1 font-bold">
            <ListChecks className="size-5 text-muted" /> Записано
          </div>
          {played.map((t) => (
            <div key={t.at} className="flex justify-between py-1.5 text-sm">
              <span className="truncate pr-2">
                {unitTitle(
                  items.find((i) => i.id === t.itemId),
                  t.sectionId,
                )}
              </span>
              <span className="shrink-0 text-muted tabular-nums">
                {t.bpm ?? "—"} · {RESULT[t.result]}
              </span>
            </div>
          ))}
        </Card>
      )}
      <Button asChild size="lg" className="w-full">
        <Link to="/" onClick={clear}>
          <Check /> Готово
        </Link>
      </Button>
    </div>
  );
}
