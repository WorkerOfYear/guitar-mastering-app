import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ListMusic, Pause, Play, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Chip, IconButton, Input, ScrollRow, Segmented } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { TYPE_ICON } from "@/components/ui/icons";
import { MetronomePanel } from "@/components/metronome/MetronomePanel";
import type { PlayerControl } from "@/components/tab/TabPlayer";
import { stopMetronome } from "@/audio/metronome";
import { audio } from "@/audio/player";
import { haptic } from "@/app/telegram";
import { formatClock, useNow, useWakeLock } from "@/lib/hooks";
import { localDate } from "@/lib/date";
import { entryKey, findSection, startingBpm } from "@/lib/progress";
import { tabOf, type LibraryTab } from "@/lib/library";
import { useData } from "@/store/data";
import { totalSeconds, unitSeconds, useFree } from "@/store/free";
import { useMetronome } from "@/store/metronome";
import type { Item, PlanEntry } from "@/shared/types";
import { Clock, MetronomeButtons, Practice, SoundBlocked } from "./SessionPage";

/** Free practice: pick anything from the library, play it as long as you like; the clock only counts up. */
export function FreePage() {
  const free = useFree();
  const { active } = free;
  const data = useData();
  const navigate = useNavigate();
  const now = useNow(250, !!active);
  const [picker, setPicker] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const control = useRef<PlayerControl | null>(null);
  useWakeLock(!!active);

  // Opened from "Сегодня": a new session, or the one left running.
  useEffect(() => {
    if (!useFree.getState().active) free.start();
  }, []);

  const entry = active?.entry ?? undefined;
  const item = entry ? data.items.find((i) => i.id === entry.itemId) : undefined;
  const key = entry ? entryKey(entry) : "";
  const running = !!active && !!entry && active.runningSince !== null;

  // A new piece starts at its working tempo, as in a session.
  useEffect(() => {
    setBlocked(false);
    if (entry && item) useMetronome.getState().set({ bpm: startingBpm(data.log, item, entry, localDate()) });
  }, [key]);
  useEffect(() => () => stopMetronome(), []);

  if (!active) return null;

  const pick = (e: PlanEntry) => {
    audio(); // unlock sound inside the tap
    haptic();
    setPicker(false);
    free.pick(e);
  };
  const togglePause = () => {
    haptic();
    if (running) free.pause();
    else free.resume();
  };
  const leave = () => {
    stopMetronome();
    navigate("/");
  };
  const finish = () => {
    const log = free.finish(data.items);
    if (log) {
      data.markPlayed(log.blocks.flatMap((b) => b.entries), log.date);
      data.addSession(log);
      toast.success("Занятие сохранено", { description: `${Math.max(1, Math.round(log.blocks.reduce((s, b) => s + b.actualSec, 0) / 60))} мин` });
    }
    leave();
  };

  const section = findSection(item, entry?.sectionId);
  const total = totalSeconds(active, now);

  return (
    <div className="pb-10">
      {/* header: the piece, the clock with play/pause and "another piece", the metronome */}
      <div className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">Свободный режим{entry && ` · это — ${formatClock(unitSeconds(active, entry, now))}`}</div>
            <div className="truncate text-lg font-bold leading-tight">{item ? (section ? `${section.title} — ${item.title}` : item.title) : "Выбери, что играть"}</div>
          </div>
          <IconButton
            label="Завершить"
            onClick={() => {
              if (total >= 5) return setConfirmEnd(true);
              free.cancel();
              leave();
            }}
            className="size-10 shrink-0"
          >
            <X />
          </IconButton>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <Clock seconds={total} running={running} />
          <IconButton label={running ? "Остановить время" : "Продолжить время"} onClick={togglePause} disabled={!entry} className="size-10 shrink-0">
            {running ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </IconButton>
          <div className="ml-auto flex items-center gap-1.5">
            <MetronomeButtons open={metronome} onOpen={setMetronome} />
            {entry && (
              <Button onClick={() => setPicker(true)} className="h-10 gap-1 px-3">
                <ListMusic className="size-4" /> Другое
              </Button>
            )}
          </div>
        </div>
      </div>

      {metronome && (
        <div className="mb-3">
          <MetronomePanel />
        </div>
      )}

      {item && entry ? (
        <>
          {!!item.sections?.length && (
            <div className="mb-3">
              <ScrollRow>
                <Chip active={!entry.sectionId} onClick={() => pick({ itemId: item.id })}>
                  Целиком
                </Chip>
                {item.sections
                  .filter((s) => s.status !== "archived")
                  .map((s) => (
                    <Chip key={s.id} active={entry.sectionId === s.id} onClick={() => pick({ itemId: item.id, sectionId: s.id })}>
                      {s.title}
                    </Chip>
                  ))}
              </ScrollRow>
            </div>
          )}
          <Practice key={key} kind="free" entry={entry} item={item} control={control} onBlocked={setBlocked} />
        </>
      ) : (
        <Picker onPick={pick} />
      )}

      <SoundBlocked show={blocked} onTap={() => setBlocked(false)} control={control} />

      <Drawer open={picker} onOpenChange={setPicker}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Что играть</DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[60dvh] overflow-y-auto pb-2">
            <Picker onPick={pick} current={entry?.itemId} />
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Завершить занятие?</DrawerTitle>
            <DrawerDescription>Прошло {formatClock(total)}</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2">
            <Button
              size="lg"
              onClick={() => {
                setConfirmEnd(false);
                finish();
              }}
              className="w-full"
            >
              <Check /> Сохранить и завершить
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                setConfirmEnd(false);
                free.cancel();
                leave();
              }}
              className="w-full text-guide"
            >
              Отменить без сохранения
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** The whole library (warm-ups included), split like the library itself, with a search. */
function Picker({ onPick, current }: { onPick: (e: PlanEntry) => void; current?: string }) {
  const { items } = useData();
  const [tab, setTab] = useState<LibraryTab>("pieces");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const live = items.filter((i) => i.status !== "archived");
  const shown = live
    .filter((i) => (q ? i.title.toLowerCase().includes(q) : tabOf(i) === tab))
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  return (
    <div className="space-y-3">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "pieces", label: "Произведения" },
          { value: "exercises", label: "Упражнения" },
        ]}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по библиотеке" className="pl-10" />
      </div>
      {shown.length ? (
        <ul className="-mx-2">
          {shown.map((i) => (
            <PickerRow key={i.id} item={i} current={i.id === current} onPick={() => onPick({ itemId: i.id })} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted">{q ? "Ничего не нашлось" : "Здесь пока пусто — добавь в библиотеке"}</p>
      )}
    </div>
  );
}

function PickerRow({ item, current, onPick }: { item: Item; current: boolean; onPick: () => void }) {
  const Icon = TYPE_ICON[item.type];
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-surface-2 ${current ? "text-accent" : ""}`}
      >
        <Icon className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
        <Play className="size-4 shrink-0 text-muted" />
      </button>
    </li>
  );
}
