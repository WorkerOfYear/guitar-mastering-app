import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EyeOff, LoaderCircle, Minus, Pause, Play, Plus, Square, Timer, Trash2, TriangleAlert, Undo2, WandSparkles } from "lucide-react";
import { Button, IconButton, Input } from "@/components/ui";
import { audioBlob } from "@/lib/audioType";
import { misplacedMarks, shortBars, SKIPPED_MS, withSkipped } from "@/lib/backingTrack";
import { formatClockMs, parseClock } from "@/lib/clock";
import { useData } from "@/store/data";
import type { Item, SyncPoint } from "@/shared/types";
import type { Lane } from "@/lib/syncLane";
import { markKey, SyncTimeline } from "./SyncTimeline";

interface Props {
  item: Item;
  audio: ArrayBuffer;
  /** The Guitar Pro file, for automatic alignment */
  tab: ArrayBuffer;
  /** Section markers of the tab, offered as sync candidates */
  sections: { title: string; bar: number }[];
  bars: number;
  /** Each bar's length at the tab's tempo, ms: to tell bars the recording rushes through */
  barMs: number[];
  /** A line is being dragged (or a bar stepped) to this moment of the recording */
  onPreview?: (ms: number) => void;
  /** The tab on the recording's time, drawn above the waveform */
  lane?: (points: SyncPoint[], skip: number[]) => Lane;
  /** While the recording plays: where it is, ms (every frame) */
  onTime?: (ms: number) => void;
  /** A bar clicked in the notes (`n` counts clicks, so the same bar can be clicked again) */
  jump?: { bar: number; n: number };
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
export function AudioSync({ item, audio, tab, sections, bars, barMs, onPreview, lane, onTime, jump }: Props) {
  const { updateItem } = useData();
  const player = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState("");
  const [newBar, setNewBar] = useState("");
  const [auto, setAuto] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const [selected, setSelected] = useState<string | null>(null);
  // Own play button and clock instead of the browser's player: the timeline is the scrubber.
  const [paused, setPaused] = useState(true);
  const [clock, setClock] = useState(0);

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
  // Bars the recording rushes through: most likely not in it (the tab repeats a riff once more, say).
  // (Bars already taken out of the recording don't count: they take a few ms on purpose.)
  const skip = item.audioSkip ?? [];
  const missing = shortBars(withSkipped(points, skip, barMs), barMs).filter((r) => r.ms >= SKIPPED_MS);
  const markOf = (bar: number) => points.find((p) => p.bar === bar && !p.occurrence);
  /**
   * Bars from…to aren't in the recording: they stay in the notes (faded) but take no time with it. Their marks go;
   * the bar after them keeps where it is now (a mark is put there if it had none).
   */
  const removeBars = (from: number, to: number) => {
    const next = to + 1;
    const at = lane?.(points, skip).bars.find((b) => b.bar === next && b.occurrence === 0)?.ms;
    const kept = points.filter((p) => p.occurrence || p.bar < from || p.bar > to);
    const marks = markOf(next) || at === undefined || next > bars ? kept : [...kept, { bar: next, ms: Math.round(at) }];
    const nextSkip = [...new Set([...skip, ...[...Array(to - from + 1)].map((_, i) => from + i)])].sort((a, b) => a - b);
    updateItem(item.id, {
      audioSkip: nextSkip,
      audioSync: marks.sort((a, b) => a.bar - b.bar || (a.occurrence ?? 0) - (b.occurrence ?? 0)),
    });
    setSelected(null);
  };
  /** Bars back in the recording: they get their time again between the marks around them. */
  const restoreBars = (from: number, to: number) => {
    const left = skip.filter((b) => b < from || b > to);
    updateItem(item.id, { audioSkip: left.length ? left : undefined });
  };
  // Runs of skipped bars, for the list under the timeline.
  const skippedRuns = skip.reduce<[number, number][]>((runs, b) => {
    const last = runs.at(-1);
    if (last && last[1] + 1 === b) last[1] = b;
    else runs.push([b, b]);
    return runs;
  }, []);
  const now = () => Math.round((player.current?.currentTime ?? 0) * 1000);
  const current = points.find((p) => markKey(p) === selected) ?? null;
  // Bar 1 and section starts that have no mark yet: one tap marks them at the playing moment.
  const unmarked = [...new Set([1, ...sections.map((s) => s.bar)])].filter((b) => !skip.includes(b) && !points.some((p) => p.bar === b && !p.occurrence));

  const mark = (bar: number) => {
    setMark({ bar }, now());
    setSelected(markKey({ bar }));
  };

  // «Послушать это место»: a stretch of the recording, stopping by itself.
  const [playingBar, setPlayingBar] = useState<string | null>(null);
  const stopAt = useRef(0);
  const frame = useRef(0);
  const stop = () => {
    cancelAnimationFrame(frame.current);
    player.current?.pause();
    setPlayingBar(null);
  };
  /** Plays the recording from…to (ms); `key` marks which button plays, pressing it again stops. */
  const playSpan = (key: string, from: number, to: number) => {
    const el = player.current;
    if (!el) return;
    if (playingBar === key) return stop();
    cancelAnimationFrame(frame.current);
    stopAt.current = to / 1000;
    el.currentTime = Math.max(0, from) / 1000;
    void el.play();
    setPlayingBar(key);
    const tick = () => {
      if (el.paused || el.currentTime >= stopAt.current) return stop();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** ▶ and space: from the selected bar when one is selected, else from where the recording is. */
  const togglePlay = () => {
    const el = player.current;
    if (!el) return;
    if (!el.paused) return el.pause();
    if (current) el.currentTime = current.ms / 1000;
    void el.play();
  };

  // A bar clicked in the notes: the recording goes there and its mark (if it has one) gets selected.
  useEffect(() => {
    if (!jump) return;
    const mark = markOf(jump.bar);
    const ms = mark?.ms ?? lane?.(points, skip).bars.find((b) => b.bar === jump.bar && b.occurrence === 0)?.ms;
    if (ms === undefined || !player.current) return;
    player.current.currentTime = Math.max(0, ms) / 1000;
    setClock(ms);
    setSelected(mark ? markKey(mark) : null);
  }, [jump?.n]);

  return (
    <div className="space-y-2">
      {url && (
        <audio
          ref={player}
          src={url}
          preload="metadata"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onSeeked={(e) => setClock(e.currentTarget.currentTime * 1000)}
          hidden
        />
      )}
      <SyncTimeline
        audio={audio}
        player={player}
        points={points}
        selected={selected}
        onSelect={setSelected}
        onMove={(p, ms) => setMark(p, ms)}
        onPreview={onPreview}
        lane={lane && ((pts) => lane(pts, skip))}
        globalKeys
        onTime={(ms) => {
          setClock((c) => (Math.abs(c - ms) >= 100 ? ms : c));
          onTime?.(ms);
        }}
        onTogglePlay={togglePlay}
      />
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          aria-label={paused ? "Играть" : "Пауза"}
          title={paused ? (current ? `Играть с такта ${current.bar} (пробел)` : "Играть (пробел)") : "Пауза (пробел)"}
          onClick={togglePlay}
          className="size-11 shrink-0"
        >
          {paused ? <Play /> : <Pause />}
        </Button>
        <div className="min-w-0 flex-1 text-sm tabular-nums">
          {formatClockMs(clock)}
          {current && <span className="text-muted"> · {paused ? "играть с такта" : "такт"} {current.bar}</span>}
        </div>
      </div>

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
          <IconButton
            label="Убрать отметку"
            onClick={() => {
              setMark(current, null);
              setSelected(null);
            }}
          >
            <Trash2 />
          </IconButton>
          {!current.occurrence && (
            <IconButton label="Такта нет в записи — убрать с таймлайна (в нотах останется)" onClick={() => removeBars(current.bar, current.bar)}>
              <EyeOff />
            </IconButton>
          )}
        </div>
      ) : (
        points.length > 0 && <p className="px-1 text-xs text-muted">Нажми на линию, чтобы поправить её точно или прослушать такт.</p>
      )}

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
      {missing.map((r) => {
        const bars = r.from === r.to ? `Такт ${r.from}` : `Такты ${r.from}–${r.to}`;
        const key = `missing:${r.from}`;
        // From the bar before to the bar after: the place with some context around it.
        const from = markOf(r.from - 1)?.ms ?? markOf(r.from)?.ms ?? 0;
        const after = markOf(r.to + 1);
        const to = (after && markOf(r.to + 2)?.ms) ?? (after ? after.ms + 2000 : from + 6000);
        return (
          <div key={key} className="space-y-2 rounded-xl bg-guide/15 p-2.5 text-sm">
            <p className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-guide" />
              <span>
                {bars} в записи — {(r.ms / 1000).toFixed(1).replace(".", ",")} с, а в её темпе {r.from === r.to ? "должен" : "должны"} занимать ~
                {(r.expectedMs / 1000).toFixed(1).replace(".", ",")} с. Похоже, в табе здесь лишние такты (например, рифф повторён лишний раз), которых
                нет в записи, — или отметки тут сбились. Послушай: если в записи их нет, убери их с таймлайна (в нотах они останутся).
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => playSpan(key, from, to)} className="h-8 rounded-lg px-2.5 text-xs">
                {playingBar === key ? <Square className="size-3.5" /> : <Play className="size-3.5" />} Послушать это место
              </Button>
              <Button variant="secondary" size="sm" onClick={() => removeBars(r.from, r.to)} className="h-8 rounded-lg px-2.5 text-xs">
                <EyeOff className="size-3.5" /> Нет в записи: убрать {r.from === r.to ? `такт ${r.from}` : `такты ${r.from}–${r.to}`}
              </Button>
            </div>
          </div>
        );
      })}
      {skippedRuns.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Нет в записи (в нотах бледные):</span>
          {skippedRuns.map(([from, to]) => (
            <Button key={from} variant="secondary" size="sm" onClick={() => restoreBars(from, to)} className="h-8 rounded-lg px-2.5 text-xs">
              <Undo2 className="size-3.5" /> {from === to ? `Такт ${from}` : `Такты ${from}–${to}`} — вернуть
            </Button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Линии — начала тактов в записи. Потяни линию, чтобы поставить её на сильную долю: на нотах видно, куда она попадает. Тап по записи —
        перемотка, по пустому месту можно листать (с разгона — по инерции), на тачпаде — свайп вбок, щипок — масштаб.
        Клик по такту в нотах — перейти к нему. ▶ и пробел играют с выбранного такта.
        <br />С клавиатуры: ←/→ — от такта к такту, Shift+←/→ — сдвинуть выбранную линию (держи — быстрее, с Alt — точнее), +/− — масштаб.
      </p>

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
