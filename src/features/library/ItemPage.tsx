import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TempoChart } from "@/components/charts/TempoChart";
import { NumberField } from "@/components/metronome/MetronomePanel";
import { Card, Chip, ScrollRow, SectionTitle } from "@/components/ui";
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
const RESULT = { clean: "чисто", errors: "с ошибками", fail: "не вышло" } as const;

export function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const setTheory = useSettings((s) => s.setTheory);
  const item = data.items.find((i) => i.id === id);
  const [newLink, setNewLink] = useState("");
  const [newSection, setNewSection] = useState("");
  const [chartSection, setChartSection] = useState<string | undefined>(item?.sections?.[0]?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!item) return <p className="pt-8 text-center text-muted">Элемент не найден</p>;

  const update = (patch: Parameters<typeof data.updateItem>[1]) => data.updateItem(item.id, patch);
  const today = localDate();
  const isSong = !!item.sections?.length || item.type === "song";
  const unit = { itemId: item.id, sectionId: isSong ? chartSection : undefined };
  const history = entriesFor(data.log, unit).sort((a, b) => b.at - a.at);
  const section = item.sections?.find((s) => s.id === chartSection);

  return (
    <div className="space-y-3 pt-2">
      <div className="text-xs text-muted">
        {TYPE_META[item.type].icon} {TYPE_META[item.type].title}
        {item.category && ` · ${item.category}`}
      </div>
      <textarea
        value={item.title}
        onChange={(e) => update({ title: e.target.value })}
        rows={1}
        className="w-full resize-none bg-transparent text-2xl font-bold leading-tight outline-none [field-sizing:content]"
      />

      {item.theory && (
        <button
          type="button"
          onClick={() => {
            setTheory({ ...item.theory!, scaleId: item.theory!.scaleId ?? "ionian", chordType: item.theory!.chordType ?? "maj7", diatonic: item.theory!.diatonic ?? 0, position: 0 });
            navigate("/theory");
          }}
          className="h-12 w-full rounded-2xl bg-surface-2 font-semibold"
        >
          🎼 Открыть на грифе
        </button>
      )}

      <SectionTitle>Таб и видео</SectionTitle>
      <MediaCard item={item} />

      {isSong && (
        <>
          <SectionTitle>Разделы — нажми на статус, чтобы сменить</SectionTitle>
          <div className="space-y-2">
            {(item.sections ?? []).map((s: Section) => (
              <Card key={s.id} className={`flex items-center gap-2 ${chartSection === s.id ? "border-accent" : ""}`}>
                <button type="button" onClick={() => setChartSection(s.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-semibold">{s.title}</div>
                  <div className="text-xs text-muted">
                    {s.bars ? `такты ${s.bars[0]}–${s.bars[1]} · ` : ""}чисто {cleanBpm(data.log, { itemId: item.id, sectionId: s.id }, today) ?? "—"} / цель {s.targetBpm ?? "—"}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => data.updateSection(item.id, s.id, { status: NEXT_STATUS[s.status] })}
                  className={`h-9 shrink-0 rounded-xl px-2.5 text-xs font-bold ${SECTION_STYLE[s.status]}`}
                >
                  {STATUS_META[s.status].title}
                </button>
              </Card>
            ))}
            <div className="flex gap-2">
              <input
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                placeholder="Новый раздел"
                className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4"
              />
              <button
                type="button"
                onClick={() => {
                  if (newSection.trim()) data.addSection(item.id, newSection.trim());
                  setNewSection("");
                }}
                className="h-11 rounded-2xl bg-surface-2 px-4 font-semibold"
              >
                +
              </button>
            </div>
          </div>
          {section && (
            <Card className="grid grid-cols-2 gap-2">
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
                onChange={(v) => data.updateSection(item.id, section.id, { bars: v && section.bars ? [section.bars[0], Math.max(section.bars[0], v)] : section.bars })}
              />
              <NumberField
                label={`Целевой темп: ${section.title}`}
                value={section.targetBpm ?? 0}
                min={0}
                onChange={(v) => data.updateSection(item.id, section.id, { targetBpm: v || null })}
              />
              <div className="flex items-end">
                <button type="button" onClick={() => data.removeSection(item.id, section.id)} className="h-11 w-full rounded-xl bg-surface-2 text-sm text-guide">
                  Удалить раздел
                </button>
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
          <div className="mt-2 divide-y divide-line">
            {history.slice(0, 8).map((t) => (
              <div key={t.at} className="flex justify-between py-1.5 text-sm">
                <span className="text-muted">{formatDay(t.date)}</span>
                <span>
                  {t.bpm ?? "—"} · {RESULT[t.result]}
                  {t.note && <span className="text-muted"> · {t.note}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Описание и заметки</SectionTitle>
      <Card className="space-y-2">
        <textarea
          value={item.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          rows={3}
          placeholder="Что и как играть"
          className="w-full rounded-2xl bg-surface-2 p-3 text-sm"
        />
        <textarea
          value={item.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          placeholder="Заметки: на что обратить внимание, где ошибаюсь"
          className="w-full rounded-2xl bg-surface-2 p-3 text-sm"
        />
      </Card>

      <SectionTitle>Ссылки</SectionTitle>
      <Card className="space-y-2">
        {item.links.map((url) => (
          <div key={url} className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-accent">
              {linkLabel(url)} ↗
            </a>
            <button type="button" onClick={() => update({ links: item.links.filter((l) => l !== url) })} className="px-2 text-muted" aria-label="Удалить ссылку">
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            inputMode="url"
            placeholder="https://… (YouTube, Songsterr, таб)"
            className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const url = newLink.trim();
              if (/^https?:\/\//.test(url) && !item.links.includes(url)) update({ links: [...item.links, url] });
              setNewLink("");
            }}
            className="h-11 rounded-2xl bg-surface-2 px-4 font-semibold"
          >
            +
          </button>
        </div>
      </Card>

      {confirmDelete ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              data.removeItem(item.id);
              navigate("/library", { replace: true });
            }}
            className="h-12 flex-1 rounded-2xl bg-guide font-bold text-on-accent"
          >
            Да, удалить
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 flex-1 rounded-2xl bg-surface-2 font-semibold">
            Отмена
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="h-12 w-full rounded-2xl text-sm font-semibold text-guide">
          Удалить элемент
        </button>
      )}
    </div>
  );
}
