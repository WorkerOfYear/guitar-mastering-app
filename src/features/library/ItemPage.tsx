import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TempoChart } from "@/components/charts/TempoChart";
import { ExternalLink, GraduationCap, Pencil, Plus, SearchX, Trash2, X } from "lucide-react";
import { Badge, Button, Card, Chip, Input, NumberField, ScrollRow, SectionTitle, Textarea, Toggle } from "@/components/ui";
import { TYPE_ICON } from "@/components/ui/icons";
import { linkLabel } from "@/features/session/EntryCard";
import { MediaCard } from "./MediaCard";
import { cleanBpm, entriesFor } from "@/lib/progress";
import { formatDay, localDate } from "@/lib/date";
import { useData } from "@/store/data";
import { useSettings } from "@/store/settings";
import { STATUS_META, SUBDIVISION_META, TYPE_META, type ItemStatus, type Section, type Subdivision } from "@/shared/types";

const NEXT_STATUS: Record<ItemStatus, ItemStatus> = { queue: "active", active: "rotation", rotation: "queue", archived: "queue" };
const SECTION_STYLE: Record<ItemStatus, string> = {
  queue: "bg-surface-2 text-muted",
  active: "bg-accent text-on-accent",
  rotation: "bg-good text-on-accent",
  archived: "bg-surface-2 text-muted",
};
const RESULT_DOT = { clean: "bg-good", errors: "bg-root", fail: "bg-guide" } as const;
const RESULT = { clean: "чисто", errors: "с ошибками", fail: "не вышло" } as const;

export function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const setTheory = useSettings((s) => s.setTheory);
  const item = data.items.find((i) => i.id === id);
  const [newLink, setNewLink] = useState("");
  const [picked, setChartSection] = useState<string | undefined>();
  const [editTitle, setEditTitle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!item)
    return (
      <div className="flex flex-col items-center gap-2 pt-12 text-center text-muted">
        <SearchX className="size-10 opacity-50" />
        Элемент не найден
      </div>
    );
  const TypeIcon = TYPE_ICON[item.type];

  const update = (patch: Parameters<typeof data.updateItem>[1]) => data.updateItem(item.id, patch);
  const today = localDate();
  const isSong = !!item.sections?.length || item.type === "song";
  // Sections can appear later (from the file's markers), so default to the first one.
  const chartSection = item.sections?.some((s) => s.id === picked) ? picked : item.sections?.[0]?.id;
  const unit = { itemId: item.id, sectionId: isSong ? chartSection : undefined };
  const history = entriesFor(data.log, unit).sort((a, b) => b.at - a.at);
  const section = item.sections?.find((s) => s.id === chartSection);

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="soft">
          <TypeIcon /> {TYPE_META[item.type].title}
        </Badge>
        {item.category && <Badge>{item.category}</Badge>}
      </div>
      {/* Plain text until the pencil is tapped — a stray tap shouldn't open the keyboard. */}
      {editTitle ? (
        <Input
          autoFocus
          value={item.title}
          onChange={(e) => update({ title: e.target.value })}
          onBlur={() => setEditTitle(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditTitle(false)}
          aria-label="Название"
          className="text-xl font-bold"
        />
      ) : (
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-[1.75rem] font-bold leading-tight tracking-tight">{item.title}</h1>
          <Button variant="ghost" size="icon-sm" aria-label="Переименовать" onClick={() => setEditTitle(true)} className="mt-0.5">
            <Pencil className="size-4" />
          </Button>
        </div>
      )}

      {item.theory && (
        <Button
          variant="secondary"
          onClick={() => {
            setTheory({
              ...item.theory!,
              scaleId: item.theory!.scaleId ?? "ionian",
              chordType: item.theory!.chordType ?? "maj7",
              diatonic: item.theory!.diatonic ?? 0,
              position: 0,
            });
            navigate("/theory");
          }}
          className="w-full"
        >
          <GraduationCap /> Открыть на грифе
        </Button>
      )}

      <Card className="py-1">
        <Toggle
          label="В разминку"
          hint={"Играется в начале каждого занятия, а не в разборе нового и повторении"}
          checked={!!item.warmup}
          onChange={(warmup) => update({ warmup })}
        />
      </Card>

      <SectionTitle>Таб и видео</SectionTitle>
      <MediaCard item={item} />

      {isSong && (
        <>
          <SectionTitle>Разделы — нажми на статус, чтобы сменить</SectionTitle>
          <div className="space-y-2">
            {(item.sections ?? []).map((s: Section) => (
              <Card
                key={s.id}
                className={`flex items-center gap-2 p-3 transition-colors ${chartSection === s.id ? "border-accent ring-1 ring-accent/40" : ""}`}
              >
                <button type="button" onClick={() => setChartSection(s.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-semibold">{s.title}</div>
                  <div className="text-xs text-muted">
                    {s.bars ? `такты ${s.bars[0]}–${s.bars[1]} · ` : ""}чисто {cleanBpm(data.log, { itemId: item.id, sectionId: s.id }, today) ?? "—"} / цель{" "}
                    {s.targetBpm ?? "—"}
                  </div>
                </button>
                <Button
                  size="icon-sm"
                  onClick={() => data.updateSection(item.id, s.id, { status: NEXT_STATUS[s.status] })}
                  className={`w-auto px-2.5 text-xs font-bold shadow-none ${SECTION_STYLE[s.status]}`}
                >
                  {STATUS_META[s.status].title}
                </Button>
              </Card>
            ))}
            {!item.sections?.length && (
              <p className="px-1 text-sm text-muted">
                {item.tabFile ? "В файле нет меток разделов — песня играется целиком." : "Загрузи таб выше — разделы возьмутся из его меток."}
              </p>
            )}
          </div>
          {section && (
            <Card className="grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1.5 text-[11px] font-medium text-muted">
                Название раздела
                <Input
                  value={section.title}
                  onChange={(e) => data.updateSection(item.id, section.id, { title: e.target.value })}
                  className="h-11 rounded-xl text-base font-semibold"
                />
              </label>
              <NumberField
                label="С такта"
                min={0}
                value={section.bars?.[0] ?? 0}
                onChange={(v) => data.updateSection(item.id, section.id, { bars: v ? [v, Math.max(v, section.bars?.[1] ?? v)] : null })}
              />
              <NumberField
                label="По такт"
                min={0}
                value={section.bars?.[1] ?? 0}
                onChange={(v) =>
                  data.updateSection(item.id, section.id, { bars: v && section.bars ? [section.bars[0], Math.max(section.bars[0], v)] : section.bars })
                }
              />
              <NumberField
                label={`Целевой темп: ${section.title}`}
                value={section.targetBpm ?? 0}
                min={0}
                onChange={(v) => data.updateSection(item.id, section.id, { targetBpm: v || null })}
              />
              <div className="flex items-end">
                <Button variant="destructive-ghost" onClick={() => data.removeSection(item.id, section.id)} className="h-11 w-full rounded-xl bg-surface-2/60">
                  <Trash2 className="size-4" /> Удалить раздел
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {!isSong && (
        <>
          <SectionTitle>Темп</SectionTitle>
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Стартовый bpm" min={0} value={item.startBpm ?? 0} onChange={(v) => update({ startBpm: v || null })} />
              <NumberField label="Целевой bpm" min={0} value={item.targetBpm ?? 0} onChange={(v) => update({ targetBpm: v || null })} />
            </div>
            <ScrollRow>
              {([1, 2, 3, 4, 6] as Subdivision[]).map((s) => (
                <Chip key={s} active={item.subdivision === s} onClick={() => update({ subdivision: s })}>
                  {SUBDIVISION_META[s]}
                </Chip>
              ))}
            </ScrollRow>
          </Card>
        </>
      )}

      <SectionTitle>Прогресс{section ? `: ${section.title}` : ""}</SectionTitle>
      <Card>
        <TempoChart entries={history} target={section?.targetBpm ?? (isSong ? null : item.targetBpm)} />
        {history.length > 0 && (
          <div className="mt-2 divide-y divide-line/60">
            {history.slice(0, 8).map((t) => (
              <div key={t.at} className="flex items-center gap-2 py-2 text-sm">
                <span className={`size-2 shrink-0 rounded-full ${RESULT_DOT[t.result]}`} />
                <span className="w-16 shrink-0 text-muted">{formatDay(t.date)}</span>
                <span className="min-w-0 flex-1 truncate text-right">
                  <b className="tabular-nums">{t.bpm ?? "—"}</b> · {RESULT[t.result]}
                  {t.note && <span className="text-muted"> · {t.note}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Описание и заметки</SectionTitle>
      <Card className="space-y-2">
        <Textarea value={item.description ?? ""} onChange={(e) => update({ description: e.target.value })} rows={3} placeholder="Что и как играть" />
        <Textarea
          value={item.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          placeholder="Заметки: на что обратить внимание, где ошибаюсь"
        />
      </Card>

      <SectionTitle>Ссылки</SectionTitle>
      <Card className="space-y-2">
        {item.links.map((url) => (
          <div key={url} className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-semibold text-accent">
              <ExternalLink className="size-4 shrink-0" />
              <span className="truncate">{linkLabel(url)}</span>
            </a>
            <Button variant="ghost" size="icon-sm" onClick={() => update({ links: item.links.filter((l) => l !== url) })} aria-label="Удалить ссылку">
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            inputMode="url"
            placeholder="https://… (YouTube, Songsterr, таб)"
            className="h-11 flex-1 text-sm"
          />
          <IconBtn
            label="Добавить ссылку"
            onClick={() => {
              const url = newLink.trim();
              if (/^https?:\/\//.test(url) && !item.links.includes(url)) update({ links: [...item.links, url] });
              setNewLink("");
            }}
          />
        </div>
      </Card>

      {confirmDelete ? (
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => {
              data.removeItem(item.id);
              navigate("/library", { replace: true });
            }}
            className="flex-1"
          >
            <Trash2 /> Да, удалить
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
            Отмена
          </Button>
        </div>
      ) : (
        <Button variant="destructive-ghost" onClick={() => setConfirmDelete(true)} className="w-full">
          <Trash2 className="size-4" /> Удалить элемент
        </Button>
      )}
    </div>
  );
}

function IconBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="secondary" size="icon" aria-label={label} onClick={onClick}>
      <Plus />
    </Button>
  );
}
