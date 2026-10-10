import { useState } from "react";
import { IconButton } from "@/components/ui";
import { clampBpm } from "@/store/metronome";
import { targetBpm, unitTitle } from "@/lib/progress";
import { localDate } from "@/lib/date";
import { useData } from "@/store/data";
import type { PlanEntry, Result } from "@/shared/types";

interface Props {
  entry: PlanEntry;
  bpm: number;
  onClose: (saved: boolean) => void;
}

const RESULTS: { value: Result; label: string; color: string }[] = [
  { value: "clean", label: "Чисто", color: "var(--good)" },
  { value: "errors", label: "С ошибками", color: "var(--root)" },
  { value: "fail", label: "Не вышло", color: "var(--guide)" },
];

/** Bottom sheet: which tempo was played and how clean it was. */
export function ResultSheet({ entry, bpm: initialBpm, onClose }: Props) {
  const { items, logTempo, markPlayed, setStatus, updateSection } = useData();
  const item = items.find((i) => i.id === entry.itemId);
  const hasTempo = item?.startBpm != null || item?.targetBpm != null || item?.type === "song";
  const [bpm, setBpm] = useState(initialBpm);
  const [useTempo, setUseTempo] = useState(hasTempo);
  const [note, setNote] = useState("");
  const [reached, setReached] = useState(false);

  const save = (result: Result) => {
    const date = localDate();
    logTempo({ itemId: entry.itemId, sectionId: entry.sectionId, date, bpm: useTempo ? bpm : null, result, note: note.trim() || undefined });
    markPlayed([entry], date);
    const target = targetBpm(item, entry.sectionId);
    if (result === "clean" && useTempo && target && bpm >= target) setReached(true);
    else onClose(true);
  };

  const toRotation = () => {
    if (entry.sectionId) updateSection(entry.itemId, entry.sectionId, { status: "rotation" });
    else setStatus(entry.itemId, "rotation");
    onClose(true);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={() => onClose(false)}>
      <div
        className="mx-auto w-full max-w-3xl rounded-t-3xl border-t border-line bg-surface p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />
        <div className="text-sm text-muted">Результат</div>
        <div className="font-bold">{unitTitle(item, entry.sectionId)}</div>

        {reached ? (
          <div className="mt-4 space-y-3">
            <p className="text-lg font-semibold">🎯 Цель достигнута: {bpm} bpm чисто!</p>
            <p className="text-sm text-muted">Перевести в ротацию? Тогда это будет попадать в блок «Повторение», а в «Разбор нового» придёт следующее.</p>
            <div className="flex gap-2">
              <button type="button" onClick={toRotation} className="h-12 flex-1 rounded-2xl bg-accent font-bold text-on-accent">
                В ротацию
              </button>
              <button type="button" onClick={() => onClose(true)} className="h-12 flex-1 rounded-2xl bg-surface-2 font-semibold">
                Ещё поработаю
              </button>
            </div>
          </div>
        ) : (
          <>
            {hasTempo && (
              <label className="mt-3 flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={useTempo} onChange={(e) => setUseTempo(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
                Записать темп
              </label>
            )}
            {useTempo && (
              <div className="mt-2 flex items-center gap-2">
                <IconButton label="−5" onClick={() => setBpm(clampBpm(bpm - 5))}>−5</IconButton>
                <IconButton label="−1" onClick={() => setBpm(clampBpm(bpm - 1))}>−</IconButton>
                <div className="flex-1 text-center text-4xl font-bold tabular-nums">{bpm}</div>
                <IconButton label="+1" onClick={() => setBpm(clampBpm(bpm + 1))}>+</IconButton>
                <IconButton label="+5" onClick={() => setBpm(clampBpm(bpm + 5))}>+5</IconButton>
              </div>
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Заметка (необязательно)"
              className="mt-3 h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base"
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {RESULTS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => save(r.value)}
                  className="h-16 rounded-2xl text-base font-bold text-on-accent"
                  style={{ background: r.color }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
