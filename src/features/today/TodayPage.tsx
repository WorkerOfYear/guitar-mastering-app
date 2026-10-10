import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui";
import { PageHeader, SettingsLink } from "@/components/ui/Placeholder";
import { buildPlan } from "@/features/session/plan";
import { resolveProgression } from "@/music/improv";
import { localDate } from "@/lib/date";
import { unitTitle } from "@/lib/progress";
import { weekStreak } from "@/lib/stats";
import { useData } from "@/store/data";
import { useSession } from "@/store/session";
import { BLOCK_META } from "@/shared/types";

const DAYS = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];

export function TodayPage() {
  const data = useData();
  const { active, start } = useSession();
  const navigate = useNavigate();
  const [seed, setSeed] = useState(0);
  const today = new Date().getDay();
  const isPracticeDay = data.practice.days.includes(today);
  const doneToday = data.sessions.some((s) => s.date === localDate());
  // Recomputed when the library changes or the user asks for another improv task.
  const plan = useMemo(
    () => buildPlan(data),
    [data.items, data.lastPlayed, data.practice, seed],
  );
  const streak = weekStreak(data.sessions, data.practice, localDate());

  const begin = () => {
    const task = plan.find((b) => b.improv)?.improv;
    if (task) data.pushRecentKey(task.key);
    start(plan);
    navigate("/session");
  };

  return (
    <div>
      <PageHeader title="Сегодня" action={<SettingsLink />} />
      <Card>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div
              key={d}
              className={`flex h-10 flex-1 items-center justify-center rounded-xl text-xs font-semibold ${
                data.practice.days.includes(d) ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted"
              } ${d === today ? "ring-2 ring-accent" : ""}`}
            >
              {DAYS[d]}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          {doneToday
            ? "Сегодня уже позанимался — отлично! 🎸"
            : isPracticeDay
              ? `Сегодня день занятия — ${Object.values(data.practice.blocks).reduce((a, b) => a + b, 0)} минут.`
              : "Сегодня отдых по расписанию. Можно позаниматься и сейчас."}
          {streak > 0 && ` Недель без пропусков: ${streak}.`}
        </p>
      </Card>

      {active ? (
        <Link to="/session" className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-bold text-on-accent">
          ▶ Вернуться к занятию
        </Link>
      ) : (
        <>
          <h2 className="px-1 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-muted">План занятия</h2>
          <div className="space-y-2">
            {plan.map((b) => (
              <Card key={b.kind}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{BLOCK_META[b.kind].icon}</span>
                  <div className="min-w-0 flex-1 font-semibold">{BLOCK_META[b.kind].title}</div>
                  <span className="text-sm font-semibold text-muted">{b.minutes} мин</span>
                </div>
                <div className="mt-1.5 pl-10 text-sm text-muted">
                  {b.improv ? (
                    <ImprovLine improv={b.improv} onReroll={() => setSeed(seed + 1)} />
                  ) : b.entries.length ? (
                    <ul className="space-y-0.5">
                      {b.entries.map((e) => (
                        <li key={`${e.itemId}#${e.sectionId ?? ""}`} className="truncate">
                          · {unitTitle(data.items.find((i) => i.id === e.itemId), e.sectionId)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>
                      Пусто — добавь элементы в{" "}
                      <Link to="/library" className="text-accent">
                        библиотеке
                      </Link>
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <button type="button" onClick={begin} className="mt-4 h-14 w-full rounded-2xl bg-accent text-base font-bold text-on-accent">
            ▶ Начать занятие
          </button>
        </>
      )}
      <Link to="/improv" className="mt-3 flex h-12 items-center justify-center rounded-2xl bg-surface-2 text-sm font-semibold">
        🎶 Импровизация вне занятия
      </Link>
    </div>
  );
}

function ImprovLine({ improv, onReroll }: { improv: { key: string; progressionId: string; challenge: string }; onReroll: () => void }) {
  const r = resolveProgression(improv.key, improv.progressionId);
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div>
          {r.keyName}: {r.chords.map((c) => c.symbol).join(" – ")}
        </div>
        <div className="text-xs">{improv.challenge}</div>
      </div>
      <button type="button" onClick={onReroll} className="shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-base" aria-label="Другое задание">
        🎲
      </button>
    </div>
  );
}
