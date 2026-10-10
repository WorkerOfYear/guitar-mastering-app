import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CompactMetronome } from "@/components/metronome/MetronomePanel";
import { Card, IconButton } from "@/components/ui";
import { signal, stopMetronome } from "@/audio/metronome";
import { haptic, tg } from "@/app/telegram";
import { ImprovPanel } from "@/features/improv/ImprovPanel";
import { formatClock, useNow, useWakeLock } from "@/lib/hooks";
import { localDate } from "@/lib/date";
import { startingBpm, unitTitle } from "@/lib/progress";
import { useData } from "@/store/data";
import { useMetronome } from "@/store/metronome";
import { blockSeconds, plannedSeconds, useSession } from "@/store/session";
import { BLOCK_META } from "@/shared/types";
import { EntryCard } from "./EntryCard";
import { ResultSheet } from "./ResultSheet";
import { SessionSummary } from "./SessionSummary";

export function SessionPage() {
  const session = useSession();
  const { active, finished } = session;
  const data = useData();
  const navigate = useNavigate();
  const now = useNow(1000, !!active);
  const [sheet, setSheet] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const signalled = useRef(new Set<string>());
  useWakeLock(!!active);

  const block = active?.blocks[active.block];
  const entry = block?.entries[active!.entry];

  // Point the metronome at the current exercise's tempo.
  useEffect(() => {
    if (!entry) return;
    const item = data.items.find((i) => i.id === entry.itemId);
    useMetronome.getState().set({
      bpm: startingBpm(data.log, item, entry, localDate()),
      ...(item?.subdivision ? { subdivision: item.subdivision } : {}),
    });
  }, [entry?.itemId, entry?.sectionId]);

  // End-of-block signal, once per block (and again after each extension).
  const signalKey = active ? `${active.block}:${active.extraMinutes[active.block]}` : "";
  const due = !!active && active.runningSince !== null && blockSeconds(active, active.block, now) >= plannedSeconds(active, active.block);
  useEffect(() => {
    if (!due || signalled.current.has(signalKey)) return;
    signalled.current.add(signalKey);
    signal();
    navigator.vibrate?.([200, 100, 200]);
    tg?.HapticFeedback?.impactOccurred("heavy");
  }, [due, signalKey]);

  if (!active) return finished ? <SessionSummary log={finished} /> : <Navigate to="/" replace />;

  const spent = blockSeconds(active, active.block, now);
  const planned = plannedSeconds(active, active.block);
  const remaining = planned - spent;
  const overtime = remaining <= 0;
  const paused = active.runningSince === null;
  const isLast = active.block === active.blocks.length - 1;
  const perEntry = block!.entries.length ? Math.round(block!.minutes / block!.entries.length) : 0;


  const finish = () => {
    stopMetronome();
    const log = session.finish();
    if (!log) return;
    const played = log.blocks.filter((b) => !b.skipped).flatMap((b) => b.entries);
    data.markPlayed(played, log.date);
    data.addSession(log);
  };

  const nextBlock = () => {
    haptic();
    stopMetronome();
    if (isLast) finish();
    else session.goToBlock(active.block + 1);
  };

  const nextEntry = () => {
    if (active.entry < block!.entries.length - 1) session.setEntry(active.entry + 1);
  };

  return (
    <div className="pb-24">
      {/* progress across blocks */}
      <div className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex gap-1.5">
          {active.blocks.map((b, i) => {
            const frac = Math.min(1, blockSeconds(active, i, now) / plannedSeconds(active, i));
            return (
              <button
                key={b.kind}
                type="button"
                onClick={() => session.goToBlock(i)}
                className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
                aria-label={BLOCK_META[b.kind].title}
              >
                <div className={`h-full ${i === active.block ? "bg-accent" : "bg-muted"}`} style={{ width: `${frac * 100}%` }} />
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">
              Блок {active.block + 1} из {active.blocks.length}
            </div>
            <div className="truncate text-xl font-bold">
              {BLOCK_META[block!.kind].icon} {BLOCK_META[block!.kind].title}
            </div>
          </div>
          <div className={`text-right tabular-nums ${overtime ? "text-guide" : ""}`}>
            <div className="text-4xl font-bold leading-none">{formatClock(remaining)}</div>
            <div className="text-[11px] text-muted">{overtime ? "сверх плана" : paused ? "пауза" : "осталось"}</div>
          </div>
          <IconButton label={paused ? "Продолжить" : "Пауза"} onClick={() => (paused ? session.resume() : session.pause())}>
            {paused ? "▶" : "❚❚"}
          </IconButton>
        </div>
      </div>

      {overtime && (
        <Card className="mb-3 flex items-center gap-2 border-guide">
          <div className="flex-1 text-sm font-semibold">Время блока вышло</div>
          <button type="button" onClick={() => session.extend(5)} className="h-11 rounded-2xl bg-surface-2 px-3 text-sm font-semibold">
            +5 мин
          </button>
          <button type="button" onClick={nextBlock} className="h-11 rounded-2xl bg-accent px-3 text-sm font-bold text-on-accent">
            {isLast ? "Завершить" : "Дальше"}
          </button>
        </Card>
      )}

      {block!.kind === "improv" ? (
        <div className="space-y-3">
          <CompactMetronome />
          {block!.improv && <ImprovPanel task={block!.improv} onChange={session.setImprov} />}
        </div>
      ) : block!.entries.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            В этом блоке пока ничего нет. Переведи элементы библиотеки в статус «{block!.kind === "review" ? "Ротация" : "В работе"}».
          </p>
          <button type="button" onClick={() => navigate("/library")} className="mt-3 h-11 rounded-2xl bg-surface-2 px-4 text-sm font-semibold">
            Открыть библиотеку
          </button>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {block!.entries.map((e, i) => (
              <button
                key={`${e.itemId}#${e.sectionId ?? ""}`}
                type="button"
                onClick={() => session.setEntry(i)}
                className={`max-w-48 shrink-0 truncate rounded-2xl border px-3 py-2 text-left text-xs font-semibold ${
                  i === active.entry ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"
                }`}
              >
                {i + 1}. {unitTitle(data.items.find((x) => x.id === e.itemId), e.sectionId)}
              </button>
            ))}
          </div>
          {perEntry > 0 && <div className="px-1 text-xs text-muted">≈ {perEntry} мин на упражнение</div>}
          {entry && <EntryCard entry={entry} />}
          <CompactMetronome />
          <div className="flex gap-2">
            <button type="button" onClick={() => setSheet(true)} className="h-14 flex-1 rounded-2xl bg-accent text-base font-bold text-on-accent">
              ✓ Записать результат
            </button>
            <IconButton label="Следующее упражнение" onClick={nextEntry} disabled={active.entry >= block!.entries.length - 1}>
              ›
            </IconButton>
          </div>
        </div>
      )}

      {/* footer */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2 px-4 py-2">
          <button type="button" onClick={() => setConfirmEnd(true)} className="h-12 rounded-2xl bg-surface-2 px-4 text-sm font-semibold">
            Завершить
          </button>
          <button type="button" onClick={nextBlock} className="h-12 flex-1 rounded-2xl bg-surface-2 text-sm font-bold">
            {isLast ? "Закончить занятие ✓" : `Дальше: ${BLOCK_META[active.blocks[active.block + 1].kind].title} →`}
          </button>
        </div>
      </div>

      {sheet && entry && (
        <ResultSheet
          entry={entry}
          bpm={useMetronome.getState().bpm}
          onClose={(saved) => {
            setSheet(false);
            if (saved) nextEntry();
          }}
        />
      )}

      {confirmEnd && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={() => setConfirmEnd(false)}>
          <div className="mx-auto w-full max-w-3xl space-y-2 rounded-t-3xl bg-surface p-4 pb-[max(env(safe-area-inset-bottom),1rem)]" onClick={(e) => e.stopPropagation()}>
            <div className="pb-1 font-bold">Завершить занятие?</div>
            <button type="button" onClick={finish} className="h-12 w-full rounded-2xl bg-accent font-bold text-on-accent">
              Сохранить и завершить
            </button>
            <button
              type="button"
              onClick={() => {
                stopMetronome();
                session.cancel();
              }}
              className="h-12 w-full rounded-2xl bg-surface-2 font-semibold text-guide"
            >
              Отменить без сохранения
            </button>
            <button type="button" onClick={() => setConfirmEnd(false)} className="h-12 w-full rounded-2xl font-semibold text-muted">
              Продолжить занятие
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
