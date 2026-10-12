import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui";
import { formatClockMs, parseClock } from "@/lib/clock";
import { useData } from "@/store/data";
import type { Item, SyncPoint } from "@/shared/types";

interface Props {
  item: Item;
  audio: ArrayBuffer;
  /** Section markers of the tab, offered as sync candidates */
  sections: { title: string; bar: number }[];
  bars: number;
}

/** Mark where bars start in the recording: listen, and tap ⏱ when the bar begins. */
export function AudioSync({ item, audio, sections, bars }: Props) {
  const { updateItem } = useData();
  const player = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState("");
  const [newBar, setNewBar] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([audio]));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);

  const points = item.audioSync ?? [];
  const candidates = [...new Set([1, ...sections.map((s) => s.bar), ...points.map((p) => p.bar)])].sort((a, b) => a - b);
  const titleOf = (bar: number) => sections.find((s) => s.bar === bar)?.title;
  const save = (next: SyncPoint[]) => updateItem(item.id, { audioSync: next.filter((p) => p.ms >= 0).sort((a, b) => a.bar - b.bar) });
  const setPoint = (bar: number, ms: number | null) => save([...points.filter((p) => p.bar !== bar), ...(ms === null ? [] : [{ bar, ms }])]);
  const now = () => Math.round((player.current?.currentTime ?? 0) * 1000);

  return (
    <div className="space-y-2">
      {url && <audio ref={player} src={url} controls preload="metadata" className="w-full" />}
      <p className="text-xs text-muted">
        Включи запись и нажми ⏱ в тот момент, когда начинается такт. Если запись в ровном темпе, хватит такта 1. Для живой записи
        отметь начало каждого раздела — между отметками ноты подстроятся под запись.
      </p>
      {candidates.map((bar) => {
        const p = points.find((x) => x.bar === bar);
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
