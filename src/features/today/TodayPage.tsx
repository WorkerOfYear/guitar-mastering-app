import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { m } from "motion/react";
import { ChevronRight, Dices, Music, Play, PlayCircle, Video } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { BLOCK_ICON, IconTile } from "@/components/ui/icons";
import { PageHeader, SettingsLink } from "@/components/ui/Placeholder";
import { audio } from "@/audio/player";
import { buildPlan } from "@/features/session/plan";
import { resolveProgression } from "@/music/improv";
import { unitTitle } from "@/lib/progress";
import { useData } from "@/store/data";
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
  const navigate = useNavigate();
  const [seed, setSeed] = useState(0);
  const plan = useMemo(() => buildPlan(data), [data.items, data.lastPlayed, data.practice, seed]);

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
        action={<SettingsLink />}
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
          <Button size="xl" onClick={begin} className="mt-5 w-full text-lg">
            <Play className="size-6" fill="currentColor" />
            Старт
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
