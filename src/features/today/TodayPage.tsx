import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { m } from "motion/react";
import { ChevronRight, Dices, Library, ListChecks, Music, Play, PlayCircle, Plus, Shuffle, Video } from "lucide-react";
import { Badge, Button, Card, Chip, ScrollRow } from "@/components/ui";
import { BLOCK_ICON, IconTile } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { audio } from "@/audio/player";
import { buildPlan } from "@/features/session/plan";
import { resolveProgression } from "@/music/improv";
import { unitTitle } from "@/lib/progress";
import { useData } from "@/store/data";
import { useFree } from "@/store/free";
import { currentPlan } from "@/store/plans";
import { useSession } from "@/store/session";
import { BLOCK_META, type Item } from "@/shared/types";

/** What plays for an entry, shown next to it in the plan. */
function MediaBadge({ item }: { item?: Item }) {
  if (item?.video)
    return (
      <Badge variant="soft">
        <Video /> видео
      </Badge>
    );
  if (item?.tab || item?.tabFile)
    return (
      <Badge variant="soft">
        <Music /> таб
      </Badge>
    );
  return null;
}

export function TodayPage() {
  const data = useData();
  const { active, start } = useSession();
  const freeActive = useFree((s) => !!s.active);
  const navigate = useNavigate();
  const [seed, setSeed] = useState(0);
  const chosen = currentPlan(data);
  const plan = useMemo(() => buildPlan({ ...data, template: chosen }), [data.items, data.lastPlayed, data.practice, chosen, seed]);

  const begin = () => {
    audio(); // unlock sound inside the tap
    const task = plan.find((b) => b.improv)?.improv;
    if (task) data.pushRecentKey(task.key);
    start(plan);
    navigate("/session");
  };

  return (
    <div>
      <PageHeader
        title="План занятия"
        subtitle={new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
      />
      {active ? (
        <Button asChild size="xl" className="w-full">
          <Link to="/session">
            <PlayCircle className="size-6" />
            Вернуться к занятию
          </Link>
        </Button>
      ) : (
        <>
          {data.items.length === 0 && (
            <Card className="mb-2.5 flex flex-col items-center gap-3 border-dashed py-6 text-center">
              <IconTile icon={Library} />
              <div>
                <div className="font-semibold">Библиотека пока пуста</div>
                <div className="mt-0.5 text-sm text-muted">Добавь упражнения и песни — они появятся в плане</div>
              </div>
              <Button asChild>
                <Link to="/library">
                  <Plus /> Добавить
                </Link>
              </Button>
            </Card>
          )}
          {!!data.plans?.length && (
            <div className="mb-2.5">
              <ScrollRow>
                <Chip active={!chosen} onClick={() => data.choosePlan(null)}>
                  Автоплан
                </Chip>
                {data.plans.map((p) => (
                  <Chip key={p.id} active={chosen?.id === p.id} onClick={() => data.choosePlan(p.id)}>
                    {p.name}
                  </Chip>
                ))}
              </ScrollRow>
            </div>
          )}
          <div className="space-y-2.5">
            {plan.map((b, i) => (
              <m.div key={b.kind} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}>
                <Card>
                  <div className="flex items-center gap-3">
                    <IconTile icon={BLOCK_ICON[b.kind]} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-tight">{BLOCK_META[b.kind].title}</div>
                      <div className="truncate text-xs text-muted">{BLOCK_META[b.kind].hint}</div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">{b.minutes} мин</span>
                  </div>
                  <div className="mt-3 text-sm">
                    {b.improv ? (
                      <ImprovLine improv={b.improv} onReroll={() => setSeed(seed + 1)} />
                    ) : b.entries.length ? (
                      <ul className="-mx-2">
                        {b.entries.map((e) => {
                          const item = data.items.find((i) => i.id === e.itemId);
                          return (
                            <li key={`${e.itemId}#${e.sectionId ?? ""}`}>
                              <Link
                                to={`/library/${e.itemId}`}
                                className="flex min-h-10 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors active:bg-surface-2"
                              >
                                <span className="min-w-0 flex-1 truncate">{unitTitle(item, e.sectionId)}</span>
                                <MediaBadge item={item} />
                                <ChevronRight className="size-4 shrink-0 text-muted" />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <span className="text-muted">Пусто</span>
                    )}
                  </div>
                </Card>
              </m.div>
            ))}
          </div>
          <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
            <Link to={chosen ? `/settings/plan/${chosen.id}` : "/settings/plan"}>
              <ListChecks className="size-4" /> {chosen ? "Изменить план" : data.plans?.length ? "Мои планы" : "Составить план вручную"}
            </Link>
          </Button>
          <Button size="xl" onClick={begin} className="mt-3 w-full text-lg">
            <Play className="size-6" fill="currentColor" />
            Старт
          </Button>
          <Button asChild variant="secondary" size="lg" className="mt-2 w-full">
            <Link to="/free">
              <Shuffle className="size-5" /> {freeActive ? "Вернуться в свободный режим" : "Свободный режим"}
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}

function ImprovLine({ improv, onReroll }: { improv: { key: string; progressionId: string; challenge: string }; onReroll: () => void }) {
  const r = resolveProgression(improv.key, improv.progressionId);
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-2/60 p-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{r.keyName}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {r.chords.map((c, i) => (
            <Badge key={i} variant="outline" className="font-mono">
              {c.symbol}
            </Badge>
          ))}
        </div>
        <div className="mt-1.5 text-xs text-muted">{improv.challenge}</div>
      </div>
      <Button variant="secondary" size="icon" onClick={onReroll} aria-label="Другое задание" className="bg-surface">
        <Dices />
      </Button>
    </div>
  );
}
