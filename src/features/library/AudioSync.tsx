import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, Minus, Play, Plus, Square, Timer, Trash2, TriangleAlert, WandSparkles } from "lucide-react";
import { Button, IconButton, Input } from "@/components/ui";
import { audioBlob } from "@/lib/audioType";
import { misplacedMarks } from "@/lib/backingTrack";
import { formatClockMs, parseClock } from "@/lib/clock";
import { useData } from "@/store/data";
import type { Item, SyncPoint } from "@/shared/types";
import { markKey, SyncTimeline } from "./SyncTimeline";

interface Props {
  item: Item;
  audio: ArrayBuffer;
  /** The Guitar Pro file, for automatic alignment */
  tab: ArrayBuffer;
  /** Section markers of the tab, offered as sync candidates */
  sections: { title: string; bar: number }[];
  bars: number;
  /** Each bar's length at the tab's tempo, ms: how long ▶ plays when the next bar isn't marked */
  barMs: number[];
  /** A line is being dragged to this moment of the recording */
  onPreview?: (ms: number) => void;
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

/**
 * Where bars start in the recording: lines on its waveform, dragged into place (or put at the playing moment with ⏱).
 * While a line is dragged, `onPreview` gets its time so the notes can show what plays there.
 */
export function AudioSync({ item, audio, tab, sections, bars, barMs, onPreview }: Props) {
  const { updateItem } = useData();
  const player = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState("");
  const [newBar, setNewBar] = useState("");
  const [auto, setAuto] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const [selected, setSelected] = useState<string | null>(null);

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
  // Marks from the older detection squashed a skipped repeat into a few ms (points a few ms apart).
  const outdated = points.some((p, i) => p.occurrence && points[i + 1] && Math.abs(points[i + 1].ms - p.ms) < 50);
  const titleOf = (bar: number) => sections.find((s) => s.bar === bar)?.title;
  const save = (next: SyncPoint[]) =>
    updateItem(item.id, { audioSync: next.filter((p) => p.ms >= 0).sort((a, b) => a.bar - b.bar || (a.occurrence ?? 0) - (b.occurrence ?? 0)) });
  const same = (p: SyncPoint, q: Pick<SyncPoint, "bar" | "occurrence">) => p.bar === q.bar && (p.occurrence ?? 0) === (q.occurrence ?? 0);
  /** Sets (or with null removes) one mark: a bar's first pass, or a later one with `occurrence`. */
  const setMark = (mark: Pick<SyncPoint, "bar" | "occurrence">, ms: number | null) => {
    const next = [...points.filter((p) => !same(p, mark)), ...(ms === null ? [] : [{ bar: mark.bar, ...(mark.occurrence ? { occurrence: mark.occurrence } : {}), ms }])];
    // A bar can't start before the bars ahead of it or after the ones behind it.
    if (ms !== null && misplacedMarks(next).some((p) => same(p, mark))) {
      const firsts = points.filter((p) => !p.occurrence && p.bar !== mark.bar);
      const before = firsts.filter((p) => p.bar < mark.bar).at(-1);
      const after = firsts.find((p) => p.bar > mark.bar);
      return toast.error(`Такт ${mark.bar} не может начинаться на ${formatClockMs(ms)}`, {
        description: [before && `такт ${before.bar} — на ${formatClockMs(before.ms)}`, after && `такт ${after.bar} — на ${formatClockMs(after.ms)}`]
          .filter(Boolean)
          .join(", "),
      });
    }
    save(next);
  };
  // Marks put at the wrong moment earlier: not used for playback, offered for removal.
  const misplaced = misplacedMarks(points);
  const now = () => Math.round((player.current?.currentTime ?? 0) * 1000);
  const current = points.find((p) => markKey(p) === selected) ?? null;
  // Bar 1 and section starts that have no mark yet: one tap marks them at the playing moment.
  const unmarked = [...new Set([1, ...sections.map((s) => s.bar)])].filter((b) => !points.some((p) => p.bar === b && !p.occurrence));

  const mark = (bar: number) => {
    setMark({ bar }, now());
    setSelected(markKey({ bar }));
  };

  // Where the next bar starts in the recording: its mark, or the bar's length in the tab, stretched like the
  // recording between the marks around it (a live take is rarely at the tab's tempo).
  const nextMs = (p: SyncPoint) => {
    const later = [...points].sort((a, b) => a.ms - b.ms).find((x) => x.ms > p.ms);
    if (later && later.bar === p.bar + 1) return later.ms;
    const firsts = points.filter((x) => !x.occurrence);
    const tabAt = (b: number) => barMs.slice(0, b - 1).reduce((a, x) => a + x, 0);
    const before = [...firsts].reverse().find((x) => x.bar <= p.bar);
    const after = firsts.find((x) => x.bar > p.bar);
    const [a, b] = before && after ? [before, after] : firsts.length > 1 ? [firsts.at(-2)!, firsts.at(-1)!] : [null, null];
    const tabSpan = a && b ? tabAt(b.bar) - tabAt(a.bar) : 0;
    const scale = a && b && tabSpan > 0 && b.ms > a.ms ? (b.ms - a.ms) / tabSpan : 1;
    return p.ms + (barMs[p.bar - 1] ?? 2000) * scale;
  };

  // ▶ for the selected mark: plays from it to the next bar, to hear whether it falls on the downbeat.
  const [playingBar, setPlayingBar] = useState<string | null>(null);
  const stopAt = useRef(0);
  const frame = useRef(0);
  const stop = () => {
    cancelAnimationFrame(frame.current);
    player.current?.pause();
    setPlayingBar(null);
  };
  const playBar = (p: SyncPoint) => {
    const el = player.current;
    if (!el) return;
    if (playingBar === markKey(p)) return stop();
    cancelAnimationFrame(frame.current);
    stopAt.current = nextMs(p) / 1000;
    el.currentTime = p.ms / 1000;
    void el.play();
    setPlayingBar(markKey(p));
    const tick = () => {
      if (el.paused || el.currentTime >= stopAt.current) return stop();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

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
      {misplaced.length > 0 && (
        <div className="space-y-2 rounded-xl bg-guide/15 p-2.5 text-sm">
          <p className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-guide" />
            <span>
              {misplaced.map((p) => `такт ${p.bar} стоит на ${formatClockMs(p.ms)}`).join(", ")} — не по порядку с соседними тактами. Ноты идут без{" "}
              {misplaced.length > 1 ? "этих отметок" : "этой отметки"}; поставь {misplaced.length > 1 ? "их" : "её"} заново или убери.
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {misplaced.map((p) => (
              <Button key={markKey(p)} variant="secondary" size="sm" onClick={() => setSelected(markKey(p))} className="h-8 rounded-lg px-2.5 text-xs">
                Показать такт {p.bar}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => save(points.filter((p) => !misplaced.includes(p)))} className="h-8 rounded-lg px-2.5 text-xs">
              <Trash2 className="size-3.5" /> Убрать {misplaced.length > 1 ? "их" : "её"}
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted">
        Линии — начала тактов в записи. Потяни линию, чтобы поставить её на сильную долю: на нотах видно, куда она попадает. Тап по записи —
        перемотка, по пустому месту можно листать (с разгона — по инерции), на тачпаде — свайп вбок, щипок — масштаб.
        <br />С клавиатуры: ←/→ двигают выбранную линию, а без неё — запись; держи — быстрее, Shift — крупнее, Alt — точнее, Esc — снять выбор.
      </p>

      <SyncTimeline
        audio={audio}
        player={player}
        points={points}
        selected={selected}
        onSelect={setSelected}
        onMove={(p, ms) => setMark(p, ms)}
        onPreview={onPreview}
      />

      {current ? (
        <div className="flex items-center gap-1 rounded-xl bg-surface p-1.5 pl-3">
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-semibold">
              Такт {current.bar}
              {current.occurrence ? `, ${current.occurrence + 1}-й раз` : ""}
            </div>
            {titleOf(current.bar) && <div className="truncate text-xs text-muted">{titleOf(current.bar)}</div>}
          </div>
          <Button variant="secondary" size="icon-sm" className="size-8 rounded-lg" aria-label="−0,05 с" title="−0,05 с" onClick={() => setMark(current, Math.max(0, current.ms - 50))}>
            <Minus className="size-3.5" />
          </Button>
          <input
            key={current.ms}
            defaultValue={formatClockMs(current.ms)}
            inputMode="decimal"
            onBlur={(e) => {
              const ms = parseClock(e.target.value);
              if (ms !== null) setMark(current, ms);
            }}
            className="h-9 w-[4.5rem] rounded-lg border border-line bg-surface-2/40 px-1 text-center text-sm tabular-nums outline-none focus:border-accent"
          />
          <Button variant="secondary" size="icon-sm" className="size-8 rounded-lg" aria-label="+0,05 с" title="+0,05 с" onClick={() => setMark(current, current.ms + 50)}>
            <Plus className="size-3.5" />
          </Button>
          <IconButton label="Поставить сюда, где играет запись" onClick={() => setMark(current, now())} className="bg-accent/15 text-accent">
            <Timer />
          </IconButton>
          <IconButton label={playingBar === markKey(current) ? "Остановить" : "Сыграть такт"} onClick={() => playBar(current)}>
            {playingBar === markKey(current) ? <Square /> : <Play />}
          </IconButton>
          <IconButton
            label="Убрать отметку"
            onClick={() => {
              setMark(current, null);
              setSelected(null);
            }}
          >
            <Trash2 />
          </IconButton>
        </div>
      ) : (
        points.length > 0 && <p className="px-1 text-xs text-muted">Нажми на линию, чтобы поправить её точно или прослушать такт.</p>
      )}

      {unmarked.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Отметить там, где играет запись:</span>
          {unmarked.map((bar) => (
            <Button key={bar} variant="secondary" size="sm" onClick={() => mark(bar)} className="h-8 rounded-lg px-2.5 text-xs">
              <Timer className="size-3.5" />
              {titleOf(bar) ? `${titleOf(bar)} (${bar})` : `Такт ${bar}`}
            </Button>
          ))}
        </div>
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
            if (bar >= 1 && bar <= bars) mark(bar);
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
