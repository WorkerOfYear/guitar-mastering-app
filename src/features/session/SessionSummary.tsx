import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import { recordsSince } from "@/lib/stats";
import { unitTitle } from "@/lib/progress";
import { useData } from "@/store/data";
import { useSession } from "@/store/session";
import { BLOCK_META, type SessionLog } from "@/shared/types";

export function SessionSummary({ log }: { log: SessionLog }) {
  const { items, log: tempoLog } = useData();
  const clear = useSession((s) => s.clearFinished);
  const total = Math.round(log.blocks.reduce((s, b) => s + b.actualSec, 0) / 60);
  const records = recordsSince(tempoLog, log.date).filter((r) => r.at >= log.startedAt);
  const played = tempoLog.filter((t) => t.at >= log.startedAt && t.at <= log.endedAt);

  return (
    <div className="space-y-3 pt-4">
      <div className="text-center">
        <div className="text-5xl">🎸</div>
        <h1 className="mt-2 text-2xl font-bold">Занятие завершено</h1>
        <p className="text-muted">{total} мин</p>
      </div>
      <Card>
        {log.blocks.map((b) => (
          <div key={b.kind} className="flex items-center justify-between py-1.5 text-sm">
            <span>
              {BLOCK_META[b.kind].icon} {BLOCK_META[b.kind].title}
            </span>
            <span className={b.skipped ? "text-muted" : "font-semibold"}>
              {b.skipped ? "пропущен" : `${Math.round(b.actualSec / 60)} / ${Math.round(b.plannedSec / 60)} мин`}
            </span>
          </div>
        ))}
      </Card>
      {records.length > 0 && (
        <Card>
          <div className="pb-1 font-bold">🏆 Новые рекорды</div>
          {records.map((r) => (
            <div key={r.at} className="flex justify-between py-1 text-sm">
              <span className="truncate pr-2">{unitTitle(items.find((i) => i.id === r.itemId), r.sectionId)}</span>
              <span className="shrink-0 font-semibold">
                {r.note} → {r.bpm}
              </span>
            </div>
          ))}
        </Card>
      )}
      {played.length > 0 && (
        <Card>
          <div className="pb-1 font-bold">Записано</div>
          {played.map((t) => (
            <div key={t.at} className="flex justify-between py-1 text-sm">
              <span className="truncate pr-2">{unitTitle(items.find((i) => i.id === t.itemId), t.sectionId)}</span>
              <span className="shrink-0 text-muted">
                {t.bpm ?? "—"} · {t.result === "clean" ? "чисто" : t.result === "errors" ? "с ошибками" : "не вышло"}
              </span>
            </div>
          ))}
        </Card>
      )}
      <Link to="/" onClick={clear} className="flex h-14 items-center justify-center rounded-2xl bg-accent text-base font-bold text-on-accent">
        Готово
      </Link>
    </div>
  );
}
