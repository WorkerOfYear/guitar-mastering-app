import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Minus, Plus, Timer, TriangleAlert, WandSparkles } from "lucide-react";
import { Button, IconButton, Input } from "@/components/ui";
import { audioBlob } from "@/lib/audioType";
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

/** Automatic alignment of the recording with the tab: what to store on the item and what to tell the user. */
export async function detectSync(tab: ArrayBuffer, audio: ArrayBuffer) {
  const { autoSync } = await import("@/lib/autoSync");
  const r = await autoSync(tab, audio);
  const shift = r.scale === 1 ? "" : `, запись ${r.scale > 1 ? "медленнее" : "быстрее"} таба на ${Math.abs(Math.round((r.scale - 1) * 1000) / 10)}%`;
  const repeat = r.skippedRepeat ? " В записи повтор в начале звучит один раз — с записью он тоже играется один раз." : "";
  const start = r.bar1Ms === null ? "" : `такт 1 на ${formatClockMs(r.bar1Ms)}`;
  // Whether the recording fits the tab at all (another tuning, another song, a part of it) — see matchCheck.ts.
  const warnings = r.check?.warnings ?? [];
  const sure = r.confidence >= 1.3;
  return {
    ok: sure && !warnings.length,
    warnings,
    patch: { audioSync: r.points, audioUnrepeat: r.unrepeat.length ? r.unrepeat : undefined, audioWarnings: warnings.length ? warnings : undefined },
    message: warnings.length
      ? `${warnings.join(" ")} Проверь на слух.`
      : sure
        ? `Готово: ${start}${shift}, ${r.points.length} отметок.${repeat} Проверь на слух.`
        : `Совпадение неуверенное — проверь на слух и поправь отметки вручную${start ? ` (${start})` : ""}.`,
  };
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
      const r = await detectSync(tab, audio);
      updateItem(item.id, r.patch);
      setAuto({ busy: false, message: `${r.ok ? "✅" : "⚠️"} ${r.message}` });
    } catch (e) {
      setAuto({ busy: false, message: `Не получилось: ${(e as Error).message}` });
    }
  };
  useEffect(() => {
    const u = URL.createObjectURL(audioBlob(audio));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);

  const points = item.audioSync ?? [];
  // Manual rows: bar 1, section starts and existing marks (auto marks every 4 bars can be many — show them compactly).
  const marked = points.filter((p) => !p.occurrence).map((p) => p.bar);
  // Marks from the older detection squashed a skipped repeat into a few ms (points a few ms apart).
  const outdated = points.some((p, i) => p.occurrence && points[i + 1] && Math.abs(points[i + 1].ms - p.ms) < 50);
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
      <Button disabled={auto.busy} onClick={() => void detect()} className="w-full">
        {auto.busy ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
        {auto.busy ? "Определяю…" : "Определить автоматически"}
      </Button>
      {auto.message && <p className="text-sm">{auto.message}</p>}
      {outdated && !auto.message && (
        <p className="flex gap-2 rounded-xl bg-guide/15 p-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-guide" />
          <span>Отметки посчитаны старой версией — из-за этого после повтора такты расходятся с записью. Нажми «Определить автоматически» ещё раз.</span>
        </p>
      )}
      <p className="text-xs text-muted">
        Или вручную: включи запись и нажми ⏱ в тот момент, когда начинается такт. Если запись в ровном темпе, хватит такта 1. Для живой записи отметь начало
        каждого раздела — между отметками ноты подстроятся под запись.
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
              className="h-11 w-20 rounded-xl border border-line bg-surface px-2 text-center text-sm tabular-nums outline-none focus:border-accent"
            />
            <IconButton label="−0,1 с" onClick={() => p && setPoint(bar, Math.max(0, p.ms - 100))} disabled={!p}>
              <Minus />
            </IconButton>
            <IconButton label="+0,1 с" onClick={() => p && setPoint(bar, p.ms + 100)} disabled={!p}>
              <Plus />
            </IconButton>
            <IconButton label="Отметить сейчас" onClick={() => setPoint(bar, now())} className="bg-accent/15 text-accent">
              <Timer />
            </IconButton>
          </div>
        );
      })}
      {hidden > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)} className="w-full text-xs">
          {showAll ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showAll ? "Скрыть промежуточные отметки" : `Показать все отметки (ещё ${hidden})`}
        </Button>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={newBar}
          onChange={(e) => setNewBar(e.target.value)}
          inputMode="numeric"
          placeholder={`Ещё такт (1–${bars})`}
          className="h-11 flex-1 rounded-xl bg-surface text-sm"
        />
        <Button
          variant="secondary"
          onClick={() => {
            const bar = Number(newBar);
            if (bar >= 1 && bar <= bars) setPoint(bar, now());
            setNewBar("");
          }}
          className="h-11 rounded-xl bg-surface px-3"
        >
          <Timer className="size-4" /> Отметить
        </Button>
      </div>
    </div>
  );
}
