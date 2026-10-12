import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui";
import { PageHeader, SettingsLink } from "@/components/ui/Placeholder";
import { audio } from "@/audio/player";
import { buildPlan } from "@/features/session/plan";
import { resolveProgression } from "@/music/improv";
import { unitTitle } from "@/lib/progress";
import { useData } from "@/store/data";
import { useSession } from "@/store/session";
import { BLOCK_META, type Item } from "@/shared/types";

/** What plays for an entry, shown next to it in the plan. */
const mediaLabel = (item?: Item) => (item?.video ? "▶ видео" : item?.tab || item?.tabFile ? "♪ таб" : "");

export function TodayPage() {
  const data = useData();
  const { active, start } = useSession();
  const navigate = useNavigate();
  const [seed, setSeed] = useState(0);
  const plan = useMemo(() => buildPlan(data), [data.items, data.lastPlayed, data.practice, seed]);
  const total = plan.reduce((sum, b) => sum + b.minutes, 0);

  const begin = () => {
    audio(); // unlock sound inside the tap
    const task = plan.find((b) => b.improv)?.improv;
    if (task) data.pushRecentKey(task.key);
    start(plan);
    navigate("/session");
  };

  return (
    <div>
      <PageHeader title="Главная" action={<SettingsLink />} />
      {active ? (
        <Link to="/session" className="flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-bold text-on-accent">
          ▶ Вернуться к занятию
        </Link>
      ) : (
        <>
          <div className="flex items-baseline justify-between px-1 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">План занятия</h2>
            <span className="text-xs text-muted">{total} мин</span>
          </div>
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
                    <ul className="space-y-1">
                      {b.entries.map((e) => {
                        const item = data.items.find((i) => i.id === e.itemId);
                        return (
                          <li key={`${e.itemId}#${e.sectionId ?? ""}`}>
                            <Link to={`/library/${e.itemId}`} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate">· {unitTitle(item, e.sectionId)}</span>
                              <span className="shrink-0 text-xs text-accent">{mediaLabel(item)}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <span>Пусто</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <button type="button" onClick={begin} className="mt-4 h-16 w-full rounded-2xl bg-accent text-lg font-bold text-on-accent">
            ▶ Старт
          </button>
          <p className="mt-2 text-center text-xs text-muted">Дальше всё само: отсчёт, упражнения и блоки переключаются по таймеру</p>
        </>
      )}
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
