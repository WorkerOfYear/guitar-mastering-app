import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, ChevronRight, ListChecks, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { BLOCK_ICON, IconTile, TYPE_ICON } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { templateSize } from "@/features/session/plan";
import { entryKey, unitTitle } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { useData } from "@/store/data";
import { BLOCK_META, type Item, type PlanEntry, type PlanTemplate, type TemplateBlock } from "@/shared/types";
import type { PracticeSettings } from "@/store/data";

const BLOCKS: TemplateBlock[] = ["warmup", "new", "review"];

const blockMinutes = (template: PlanTemplate, block: TemplateBlock, items: Item[], practice: PracticeSettings) =>
  block === "warmup" && template.warmup.length
    ? template.warmup.reduce((sum, e) => sum + (items.find((i) => i.id === e.itemId)?.minutes ?? 3), 0)
    : practice.blocks[block];

/** The user's plans; the one chosen for "Сегодня" is marked. A new plan opens right away. */
export function PlanBuilderPage() {
  const { items, practice, plans = [], planId, addPlan } = useData();
  const navigate = useNavigate();
  const create = () => navigate(`/settings/plan/${addPlan(`План ${plans.length + 1}`)}`);
  return (
    <div className="space-y-3">
      <PageHeader title="Конструктор плана" />
      <p className="px-1 text-sm text-muted">
        Составь несколько планов и выбирай нужный на «Сегодня». Пока план не выбран, занятие подбирается автоматически.
      </p>
      <Card className={cn("flex items-center gap-3", !planId && "border-accent")}>
        <IconTile icon={Sparkles} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">Автоплан</div>
          <div className="truncate text-xs text-muted">Новое и то, что дольше всего не играл</div>
        </div>
        {!planId && <Badge variant="soft">на сегодня</Badge>}
      </Card>
      {plans.map((p) => {
        const count = templateSize(p);
        const total = BLOCKS.reduce((sum, b) => sum + blockMinutes(p, b, items, practice), 0) + practice.blocks.improv;
        return (
          <Link key={p.id} to={`/settings/plan/${p.id}`} className="block">
            <Card className={cn("flex items-center gap-3 transition-colors active:bg-surface-2", planId === p.id && "border-accent")}>
              <IconTile icon={ListChecks} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold leading-tight">{p.name}</div>
                <div className="truncate text-xs text-muted">{count ? `${count} упр. · ${total} мин` : "Пусто — пока играет автоплан"}</div>
              </div>
              {planId === p.id && <Badge variant="soft">на сегодня</Badge>}
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </Card>
          </Link>
        );
      })}
      <Button variant="dashed" onClick={create} className="w-full">
        <Plus className="size-4" /> Новый план
      </Button>
    </div>
  );
}

/** One hand-made plan: which library items each block plays, in order. */
export function PlanEditorPage() {
  const { id = "" } = useParams();
  const { items, practice, plans = [], planId, updatePlan, removePlan, choosePlan } = useData();
  const navigate = useNavigate();
  const [picking, setPicking] = useState<TemplateBlock | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const template = plans.find((p) => p.id === id);
  if (!template) return <Navigate to="/settings/plan" replace />;

  const change = (block: TemplateBlock, entries: PlanEntry[]) => updatePlan(id, { [block]: entries });
  const move = (block: TemplateBlock, i: number, d: number) => {
    const list = [...template[block]];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    change(block, list);
  };
  const minutes = (block: TemplateBlock) => blockMinutes(template, block, items, practice);

  return (
    <div className="space-y-3">
      <PageHeader title={template.name || "План"} />
      <Input
        value={template.name}
        onChange={(e) => updatePlan(id, { name: e.target.value })}
        onBlur={() => !template.name.trim() && updatePlan(id, { name: "План" })}
        aria-label="Название плана"
        placeholder="Название плана"
      />
      <p className="px-1 text-sm text-muted">
        Выбери, что играть в каждом блоке. Занятие пойдёт ровно по этому списку.
        {!templateSize(template) && " Пока список пуст, вместо него играет автоплан."}
      </p>
      {planId === id ? (
        <div className="flex items-center gap-2 px-1 text-sm text-good">
          <Check className="size-4" /> Этот план стоит на «Сегодня»
        </div>
      ) : (
        <Button variant="secondary" onClick={() => choosePlan(id)} className="w-full">
          <Check className="size-4" /> Играть по нему на «Сегодня»
        </Button>
      )}

      {BLOCKS.map((block) => {
        const entries = template[block];
        return (
          <Card key={block}>
            <div className="flex items-center gap-3">
              <IconTile icon={BLOCK_ICON[block]} />
              <div className="min-w-0 flex-1 font-semibold">{BLOCK_META[block].title}</div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">{minutes(block)} мин</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {entries.map((e, i) => {
                const item = items.find((x) => x.id === e.itemId);
                const Icon = item ? TYPE_ICON[item.type] : X;
                return (
                  <li key={entryKey(e)} className="flex items-center gap-1 rounded-2xl bg-surface-2/60 py-1 pl-3 pr-1">
                    <Icon className="size-4 shrink-0 text-accent" />
                    <span className={cn("min-w-0 flex-1 truncate px-1.5 text-sm", !item && "text-muted line-through")}>
                      {item ? unitTitle(item, e.sectionId) : "Удалено из библиотеки"}
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label="Выше" disabled={i === 0} onClick={() => move(block, i, -1)}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Ниже" disabled={i === entries.length - 1} onClick={() => move(block, i, 1)}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Убрать"
                      onClick={() =>
                        change(
                          block,
                          entries.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button variant="dashed" size="sm" onClick={() => setPicking(block)} className={cn("w-full", entries.length && "mt-2")}>
              <Plus className="size-4" /> Добавить из библиотеки
            </Button>
          </Card>
        );
      })}

      <Button variant="destructive-ghost" onClick={() => setConfirmDelete(true)} className="w-full">
        <Trash2 className="size-4" /> Удалить план
      </Button>

      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Удалить «{template.name}»?</DrawerTitle>
            {planId === id && <DrawerDescription>На «Сегодня» снова будет автоплан</DrawerDescription>}
          </DrawerHeader>
          <div className="space-y-2">
            <Button
              size="lg"
              variant="destructive"
              onClick={() => {
                removePlan(id);
                navigate("/settings/plan", { replace: true });
              }}
              className="w-full"
            >
              <Trash2 /> Удалить
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setConfirmDelete(false)} className="w-full">
              Оставить
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DrawerContent>
          {picking && (
            <Picker block={picking} chosen={template[picking]} onAdd={(e) => change(picking, [...template[picking], e])} onDone={() => setPicking(null)} />
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** Library list to pick from; songs also offer their sections. Stays open to add several. */
function Picker({ block, chosen, onAdd, onDone }: { block: TemplateBlock; chosen: PlanEntry[]; onAdd: (e: PlanEntry) => void; onDone: () => void }) {
  const items = useData((s) => s.items).filter((i) => i.status !== "archived");
  const taken = new Set(chosen.map(entryKey));
  const Row = ({ entry, title, sub, icon: Icon, nested }: { entry: PlanEntry; title: string; sub?: string; icon?: typeof Plus; nested?: boolean }) => {
    const on = taken.has(entryKey(entry));
    return (
      <button
        type="button"
        disabled={on}
        onClick={() => onAdd(entry)}
        className={cn("flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors active:bg-surface-2", nested && "pl-10")}
      >
        {Icon && <Icon className="size-5 shrink-0 text-accent" />}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", nested ? "text-sm" : "font-semibold")}>{title}</span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        </span>
        {on ? <Check className="size-5 shrink-0 text-good" /> : <Plus className="size-5 shrink-0 text-muted" />}
      </button>
    );
  };

  return (
    <>
      <DrawerHeader>
        <DrawerDescription>Добавить в блок</DrawerDescription>
        <DrawerTitle>{BLOCK_META[block].title}</DrawerTitle>
      </DrawerHeader>
      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="space-y-3 px-2 py-6 text-center text-sm text-muted">
            <p>В библиотеке пока ничего нет.</p>
            <Button asChild>
              <Link to="/library">
                <Plus /> Добавить в библиотеку
              </Link>
            </Button>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id}>
              <Row entry={{ itemId: item.id }} title={item.title} sub={item.sections?.length ? "вся песня" : undefined} icon={TYPE_ICON[item.type]} />
              {item.sections?.map((s) => (
                <Row key={s.id} entry={{ itemId: item.id, sectionId: s.id }} title={s.title} nested />
              ))}
            </div>
          ))
        )}
      </div>
      <Button size="lg" onClick={onDone} className="mt-3 w-full shrink-0">
        Готово
      </Button>
    </>
  );
}
