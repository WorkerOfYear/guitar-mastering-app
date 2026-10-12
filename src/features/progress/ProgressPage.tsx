import { Link } from "react-router-dom";
import { m } from "motion/react";
import { CalendarCheck, Clock, Flame, Timer, Trophy, type LucideIcon } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import { BLOCK_ICON } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { addDays, formatDay, localDate, weekStart } from "@/lib/date";
import { cleanBpm, unitTitle } from "@/lib/progress";
import { minutesBetween, minutesByBlock, practiceDays, recordsSince, sessionStreak, weekStreak } from "@/lib/stats";
import { useData } from "@/store/data";
import { BLOCK_META, type BlockKind } from "@/shared/types";

const WEEKS = 15;

export function ProgressPage() {
  const { items, log, sessions, practice } = useData();
  const today = localDate();
  const monday = weekStart(today);
  const monthStart = today.slice(0, 8) + "01";
  const goals = items.filter((i) => i.type === "song" && i.status !== "archived");
  const records = recordsSince(log, addDays(today, -13)).reverse();
  const byBlock = minutesByBlock(sessions, monthStart);
  const maxBlock = Math.max(1, ...Object.values(byBlock));

  return (
    <div className="space-y-3">
      <PageHeader title="Прогресс" />
      <div className="grid grid-cols-2 gap-2">
        <Tile icon={CalendarCheck} value={weekStreak(sessions, practice, today)} label="недель подряд без пропусков" />
        <Tile icon={Flame} value={sessionStreak(sessions, practice, today)} label="занятий подряд" />
        <Tile icon={Timer} value={minutesBetween(sessions, monday, today)} label="минут на этой неделе" />
        <Tile icon={Clock} value={minutesBetween(sessions, monthStart, today)} label="минут в этом месяце" />
      </div>

      <SectionTitle>Цели</SectionTitle>
      {goals.map((g) => {
        const secs = g.sections ?? [];
        const done = secs.filter((s) => s.status === "rotation").length;
        return (
          <Link key={g.id} to={`/library/${g.id}`} className="block">
            <Card>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate font-semibold">{g.title}</div>
                <div className="shrink-0 text-sm tabular-nums text-muted">
                  {done}/{secs.length}
                </div>
              </div>
              <div className="mt-2 flex gap-1">
                {secs.map((s) => {
                  const clean = cleanBpm(log, { itemId: g.id, sectionId: s.id }, today);
                  const pct = s.targetBpm && clean ? Math.min(1, clean / s.targetBpm) : 0;
                  return (
                    <div key={s.id} className="min-w-0 flex-1" title={`${s.title}: ${clean ?? "—"}/${s.targetBpm ?? "—"}`}>
                      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                        <m.div
                          className={`h-full rounded-full ${s.status === "rotation" ? "bg-good" : "bg-accent"}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${s.status === "rotation" ? 100 : pct * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                      <div className="mt-1 truncate text-[10px] text-muted">{s.title}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Link>
        );
      })}

      <SectionTitle>Календарь</SectionTitle>
      <Card>
        <Calendar />
      </Card>

      <SectionTitle>Время по блокам в этом месяце</SectionTitle>
      <Card className="space-y-2">
        {(Object.keys(byBlock) as BlockKind[]).map((k) => {
          const Icon = BLOCK_ICON[k];
          return (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="flex w-36 shrink-0 items-center gap-1.5 truncate">
                <Icon className="size-4 shrink-0 text-accent" /> {BLOCK_META[k].title}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                <m.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${(byBlock[k] / maxBlock) * 100}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted">{byBlock[k]} мин</span>
            </div>
          );
        })}
      </Card>

      <SectionTitle>Рекорды за 2 недели</SectionTitle>
      <Card>
        {records.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Trophy className="size-8 shrink-0 opacity-40" />
            Рекорды появятся, когда ты сыграешь что-то чисто быстрее, чем раньше.
          </div>
        ) : (
          records.map((r) => (
            <div key={r.at} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Trophy className="size-4 shrink-0 text-accent" />
                <span className="truncate">
                  {unitTitle(
                    items.find((i) => i.id === r.itemId),
                    r.sectionId,
                  )}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="text-muted">{r.note} → </span>
                <b>{r.bpm}</b>
                <span className="text-muted"> · {formatDay(r.date)}</span>
              </span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function Tile({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <Card className="relative overflow-hidden">
      <Icon className="absolute -right-2 -top-2 size-16 text-accent opacity-10" />
      <Icon className="size-5 text-accent" />
      <div className="mt-2 text-3xl font-bold tabular-nums leading-none tracking-tight">{value}</div>
      <div className="mt-1 text-xs leading-tight text-muted">{label}</div>
    </Card>
  );
}

/** Last weeks as a grid: rows Mon–Sun, one column per week; shade = minutes played. */
function Calendar() {
  const { sessions, practice } = useData();
  const today = localDate();
  const days = practiceDays(sessions);
  const first = addDays(weekStart(today), -7 * (WEEKS - 1));
  const labels = ["ПН", "", "СР", "", "", "СБ", ""];
  return (
    <div className="flex gap-1">
      <div className="flex flex-col gap-1 pr-1">
        {labels.map((l, i) => (
          <div key={i} className="flex h-4 items-center text-[9px] text-muted">
            {l}
          </div>
        ))}
      </div>
      {Array.from({ length: WEEKS }, (_, w) => (
        <div key={w} className="flex flex-1 flex-col gap-1">
          {Array.from({ length: 7 }, (_, d) => {
            const day = addDays(first, w * 7 + d);
            const minutes = days.get(day) ?? 0;
            const planned = practice.days.includes((d + 1) % 7);
            const future = day > today;
            return (
              <div
                key={d}
                title={`${formatDay(day)}: ${minutes} мин`}
                className={`h-4 rounded-[3px] ${day === today ? "ring-1 ring-fg" : ""}`}
                style={{
                  background: minutes
                    ? `color-mix(in oklab, var(--accent) ${Math.min(100, 35 + minutes)}%, var(--surface-2))`
                    : future
                      ? "transparent"
                      : "var(--surface-2)",
                  border: !minutes && planned && !future ? "1px dashed var(--border)" : undefined,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
