import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui";
import { formatClockMs, parseClock } from "@/lib/clock";
import { useData } from "@/store/data";
import type { Item, SyncPoint } from "@/shared/types";

interface Props {
  item: Item;
  audio: ArrayBuffer;
  /** The Guitar Pro file, for automatic alignment */
  tab: ArrayBuffer;
  /** Section markers of the tab, offered as sync candidates */
  sections: { title: string; bar: number }[];
  bars: number;
}

/** Mark where bars start in the recording: listen, and tap ⏱ when the bar begins. */
export function AudioSync({ item, audio, tab, sections, bars }: Props) {
  const { updateItem } = useData();
  const player = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState("");
  const [newBar, setNewBar] = useState("");
  const [auto, setAuto] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const [showAll, setShowAll] = useState(false);

  const detect = async () => {
    setAuto({ busy: true, message: "Слушаю запись и сравниваю с табом… (5–20 секунд)" });
    try {
      const { autoSync } = await import("@/lib/autoSync");
      const r = await autoSync(tab, audio);
      updateItem(item.id, { audioSync: r.points });
      const shift = r.scale === 1 ? "" : `, запись ${r.scale > 1 ? "медленнее" : "быстрее"} таба на ${Math.abs(Math.round((r.scale - 1) * 1000) / 10)}%`;
      const repeat = r.skippedRepeat ? " Повтор в начале таба в записи звучит один раз — второй проход пропускается." : "";
      const start = r.bar1Ms === null ? "" : `такт 1 на ${formatClockMs(r.bar1Ms)}`;
      setAuto({
        busy: false,
        message:
          r.confidence >= 1.3
            ? `✅ Готово: ${start}${shift}, ${r.points.length} отметок.${repeat} Проверь на слух.`
            : `⚠️ Совпадение неуверенное — проверь на слух и поправь отметки вручную (${start}).`,
      });
    } catch (e) {
      setAuto({ busy: false, message: `Не получилось: ${(e as Error).message}` });
    }
  };
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([audio]));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);

  const points = item.audioSync ?? [];
  // Manual rows: bar 1, section starts and existing marks (auto marks every 4 bars can be many — show them compactly).
  const marked = points.filter((p) => !p.occurrence).map((p) => p.bar);
  const main = [1, ...sections.map((s) => s.bar)];
  const candidates = [...new Set([...main, ...(showAll ? marked : [])])].sort((a, b) => a - b);
  const hidden = new Set(marked.filter((b) => !main.includes(b))).size;
  const titleOf = (bar: number) => sections.find((s) => s.bar === bar)?.title;
  const save = (next: SyncPoint[]) =>
    updateItem(item.id, { audioSync: next.filter((p) => p.ms >= 0).sort((a, b) => a.bar - b.bar || (a.occurrence ?? 0) - (b.occurrence ?? 0)) });
  // Manual marks are for the first pass of a bar; marks on repeats come from the automatic detection.
  const setPoint = (bar: number, ms: number | null) => save([...points.filter((p) => p.bar !== bar || p.occurrence), ...(ms === null ? [] : [{ bar, ms }])]);
  const now = () => Math.round((player.current?.currentTime ?? 0) * 1000);

  return (
    <div className="space-y-2">
      {url && <audio ref={player} src={url} controls preload="metadata" className="w-full" />}
      <button
        type="button"
        disabled={auto.busy}
        onClick={() => void detect()}
        className="h-12 w-full rounded-2xl bg-accent text-sm font-bold text-on-accent disabled:opacity-60"
      >
        {auto.busy ? "⏳ Определяю…" : "🪄 Определить автоматически"}
      </button>
      {auto.message && <p className="text-sm">{auto.message}</p>}
      <p className="text-xs text-muted">
        Или вручную: включи запись и нажми ⏱ в тот момент, когда начинается такт. Если запись в ровном темпе, хватит такта 1. Для живой записи
        отметь начало каждого раздела — между отметками ноты подстроятся под запись.
      </p>
      {candidates.map((bar) => {
        const p = points.find((x) => x.bar === bar && !x.occurrence);
        return (
          <div key={bar} className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-semibold">Такт {bar}</div>
              {titleOf(bar) && <div className="truncate text-xs text-muted">{titleOf(bar)}</div>}
            </div>
            <input
              key={p?.ms ?? "none"}
              defaultValue={p ? formatClockMs(p.ms) : ""}
              placeholder="—"
              inputMode="decimal"
              onBlur={(e) => setPoint(bar, e.target.value.trim() ? parseClock(e.target.value) : null)}
              className="h-11 w-20 rounded-xl border border-line bg-surface-2 px-2 text-center text-sm tabular-nums"
            />
            <IconButton label="−0,1 с" onClick={() => p && setPoint(bar, Math.max(0, p.ms - 100))} disabled={!p}>
              −
            </IconButton>
            <IconButton label="+0,1 с" onClick={() => p && setPoint(bar, p.ms + 100)} disabled={!p}>
              +
            </IconButton>
            <IconButton label="Отметить сейчас" onClick={() => setPoint(bar, now())}>
              ⏱
            </IconButton>
          </div>
        );
      })}
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="h-10 w-full rounded-xl bg-surface text-xs font-semibold text-muted">
          {showAll ? "Скрыть промежуточные отметки" : `Показать все отметки (ещё ${hidden})`}
        </button>
      )}
      <div className="flex items-center gap-2">
        <input
          value={newBar}
          onChange={(e) => setNewBar(e.target.value)}
          inputMode="numeric"
          placeholder={`Ещё такт (1–${bars})`}
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            const bar = Number(newBar);
            if (bar >= 1 && bar <= bars) setPoint(bar, now());
            setNewBar("");
          }}
          className="h-11 rounded-xl bg-surface-2 px-3 text-sm font-semibold"
        >
          ⏱ Отметить
        </button>
      </div>
    </div>
  );
}
