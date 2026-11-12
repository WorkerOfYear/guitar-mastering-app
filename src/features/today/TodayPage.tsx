import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { m } from "motion/react";
import { ChevronDown, ChevronRight, Dices, Library, ListChecks, Music, Pencil, Play, PlayCircle, Plus, Shuffle, Video } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { BLOCK_ICON, IconTile } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { audio } from "@/audio/player";
import { buildPlan, templateSize } from "@/features/session/plan";
import { resolveProgression } from "@/music/improv";
import { unitTitle } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { useData } from "@/store/data";
import { useFree } from "@/store/free";
import { useSession } from "@/store/session";
import { BLOCK_META, type Item, type PlanBlock, type SavedPlan } from "@/shared/types";

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
  const plans = data.plans ?? [];

  /** Starts a session from one of the user's plans; `planId` is remembered as the last one played. */
  const begin = (plan: PlanBlock[], planId: string) => {
    audio(); // unlock sound inside the tap
    const task = plan.find((b) => b.improv)?.improv;
    if (task) data.pushRecentKey(task.key);
    if (data.planId !== planId) data.choosePlan(planId);
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
          {/* Free mode is no longer offered here; a free session already running can still be finished. */}
          {freeActive && (
            <Button asChild variant="secondary" className="mb-2.5 w-full">
              <Link to="/free">
                <Shuffle /> Вернуться в свободный режим
              </Link>
            </Button>
          )}
          <MyPlans plans={plans} onStart={begin} />
        </>
      )}
    </div>
  );
}

/** Every hand-made plan; a card opens to show what's inside, "Начать" plays it. */
function MyPlans({ plans, onStart }: { plans: SavedPlan[]; onStart: (plan: PlanBlock[], planId: string) => void }) {
  const { addPlan } = useData();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const create = () => navigate(`/settings/plan/${addPlan(`План ${plans.length + 1}`)}`);
  return (
    <div className="space-y-2.5">
      {!plans.length && (
        <Card className="flex flex-col items-center gap-3 border-dashed py-6 text-center">
          <IconTile icon={ListChecks} />
          <div>
            <div className="font-semibold">Своих планов пока нет</div>
            <div className="mt-0.5 text-sm text-muted">Собери план из упражнений библиотеки — и занимайся ровно по нему</div>
          </div>
        </Card>
      )}
      {plans.map((p) => (
        <PlanCard key={p.id} saved={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} onStart={(plan) => onStart(plan, p.id)} />
      ))}
      <Button variant="dashed" onClick={create} className="w-full">
        <Plus className="size-4" /> Новый план
      </Button>
    </div>
  );
}

function PlanCard({ saved, open, onToggle, onStart }: { saved: SavedPlan; open: boolean; onToggle: () => void; onStart: (plan: PlanBlock[]) => void }) {
  const data = useData();
  const [seed, setSeed] = useState(0);
  const plan = useMemo(() => buildPlan({ ...data, template: saved }), [data.items, data.lastPlayed, data.practice, saved, seed]);
  const count = templateSize(saved);
  const total = plan.reduce((sum, b) => sum + b.minutes, 0);
  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 p-2 pl-4">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left outline-none">
          <IconTile icon={ListChecks} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold leading-tight">{saved.name || "План"}</div>
            <div className="truncate text-xs text-muted">{count ? `${count} упр. · ${total} мин` : "Пусто — добавь упражнения"}</div>
          </div>
          <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </button>
        <Button size="sm" onClick={() => onStart(plan)} disabled={!count}>
          <Play className="size-4" fill="currentColor" /> Начать
        </Button>
      </div>
      {open && (
        <div className="space-y-2.5 border-t border-line/70 p-3">
          {count ? <PlanBlocks plan={plan} onReroll={() => setSeed(seed + 1)} flat /> : <div className="px-1 text-sm text-muted">В плане пока ничего нет.</div>}
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to={`/settings/plan/${saved.id}`}>
              <Pencil className="size-4" /> Изменить план
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}

/** A plan's blocks with what each one plays. `flat` drops the card frames for use inside another card. */
function PlanBlocks({ plan, onReroll, flat }: { plan: PlanBlock[]; onReroll: () => void; flat?: boolean }) {
  const { items } = useData();
  return (
    <div className="space-y-2.5">
      {plan.map((b, i) => {
        const body = (
          <>
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
                <ImprovLine improv={b.improv} onReroll={onReroll} />
              ) : b.entries.length ? (
                <ul className="-mx-2">
                  {b.entries.map((e) => {
                    const item = items.find((i) => i.id === e.itemId);
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
          </>
        );
        if (flat) return <div key={b.kind}>{body}</div>;
        return (
          <m.div key={b.kind} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}>
            <Card>{body}</Card>
          </m.div>
        );
      })}
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
