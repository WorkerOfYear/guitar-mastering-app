import { Suspense, lazy, useEffect, useRef, useState, type RefObject } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Check, ChevronRight, Headphones, Metronome, Minus, Pause, Piano, Play, Plus, Settings2, Volume2, X } from "lucide-react";
import { SessionMetronome } from "@/components/metronome/MetronomePanel";
import { Button, Chip, IconButton, Progress, ScrollRow, Segmented } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BLOCK_ICON } from "@/components/ui/icons";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { ItemBoard } from "@/components/fretboard/ItemBoard";
import type { PlayerControl, ScoreInfo } from "@/components/tab/TabPlayer";
import { audio } from "@/audio/player";
import { signal, stopMetronome, toggleMetronome } from "@/audio/metronome";
import { haptic, tg } from "@/app/telegram";
import { ImprovPanel } from "@/features/improv/ImprovPanel";
import { formatClock, useNow, useWakeLock } from "@/lib/hooks";
import { localDate } from "@/lib/date";
import { findSection, startingBpm, unitTitle } from "@/lib/progress";
import { MATERIAL_LABEL, hasBlock, materialsOf, shownText, withMetronome, type Material } from "@/lib/library";
import { RecordButton } from "@/features/library/Takes";
import { ON_TAB, VIEW_META, VIEW_NEXT } from "@/features/library/MediaCard";
import { loadAudioFile, loadTabFile } from "@/lib/tabFiles";
import { audioBlob } from "@/lib/audioType";
import { cn } from "@/lib/utils";
import { useData } from "@/store/data";
import { clampBpm, useMetronome } from "@/store/metronome";
import { useSettings } from "@/store/settings";
import { blockSeconds, plannedSeconds, useSession } from "@/store/session";
import { BLOCK_META, type Item, type PlanEntry } from "@/shared/types";
import { EntryCard } from "./EntryCard";
import { SessionSummary } from "./SessionSummary";

const TabPlayer = lazy(() => import("@/components/tab/TabPlayer"));

/** The tab takes the screen under the header. */
const TAB_HEIGHT = "max(16rem, calc(100dvh - 18rem))";

/**
 * A planned session: starts at once, one exercise after another as you tap "Дальше", or any block picked on top.
 * Time is counted per block in the background (a bar shows how far); a signal when it is up, and it keeps counting.
 * Videos and notes start only when you press their play.
 */
export function SessionPage() {
  const session = useSession();
  const { active, finished } = session;
  const data = useData();
  const now = useNow(250, !!active);
  const [blocked, setBlocked] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const control = useRef<PlayerControl | null>(null);
  useWakeLock(!!active);

  const block = active?.blocks[active.block];
  const index = block ? Math.min(active!.entry, Math.max(0, block.entries.length - 1)) : 0;
  const entry: PlanEntry | undefined = block?.entries[index];
  const item = entry ? data.items.find((i) => i.id === entry.itemId) : undefined;
  const entryKey = active ? `${active.id}:${active.block}:${index}` : "";
  const isLast = !!active && active.block === active.blocks.length - 1;
  const lastEntry = !block || index >= block.entries.length - 1;
  const planned = active ? plannedSeconds(active, active.block) : 0;
  const spent = active ? blockSeconds(active, active.block, now) : 0;
  const over = spent >= planned;
  const running = !!active && active.runningSince !== null;

  // A new exercise opens at its working tempo; the rhythm is the player's choice on the metronome.
  useEffect(() => {
    if (!active) return;
    setBlocked(false);
    if (entry) {
      const it = data.items.find((i) => i.id === entry.itemId);
      useMetronome.getState().set({ bpm: startingBpm(data.log, it, entry, localDate()) });
    }
  }, [entryKey]);

  // The block's time is up: one signal, the clock goes on. A block already over when the screen opens stays quiet.
  const blockKey = active ? `${active.id}:${active.block}` : "";
  const signalled = useRef(new Set<string>());
  const seen = useRef(false);
  useEffect(() => {
    if (!active || !over || signalled.current.has(blockKey)) return;
    signalled.current.add(blockKey);
    if (!seen.current) return;
    signal();
    navigator.vibrate?.([200, 100, 200]);
    tg?.HapticFeedback?.impactOccurred("heavy");
  }, [blockKey, over]);
  useEffect(() => {
    seen.current = true;
  }, []);

  useEffect(() => () => stopMetronome(), []);

  if (!active || !block) return finished ? <SessionSummary log={finished} /> : <Navigate to="/" replace />;

  function finish() {
    stopMetronome();
    const log = session.finish();
    if (!log) return;
    data.markPlayed(
      log.blocks.filter((b) => !b.skipped).flatMap((b) => b.entries),
      log.date,
    );
    data.addSession(log);
  }

  const togglePause = () => {
    haptic();
    if (running) session.pause();
    else session.resume();
  };
  const next = () => {
    haptic();
    if (!lastEntry) session.goToEntry(index + 1);
    else if (isLast) finish();
    else session.goToBlock(active.block + 1);
  };

  const nextTitle = !lastEntry
    ? unitTitle(
        data.items.find((i) => i.id === block.entries[index + 1].itemId),
        block.entries[index + 1].sectionId,
      )
    : !isLast
      ? BLOCK_META[active.blocks[active.block + 1].kind].title
      : "Конец занятия";
  // Section first: "Intro — Technical Difficulties" stays readable when truncated.
  const section = findSection(item, entry?.sectionId);
  const title = block.kind === "improv" ? "Импровизация" : section ? `${section.title} — ${item?.title}` : item ? item.title : BLOCK_META[block.kind].title;
  const total = active.blocks.reduce((sum, _, i) => sum + blockSeconds(active, i, now), 0);

  return (
    <div className="pb-10">
      {/* header: the blocks to jump between, the exercise, its clock with play/pause and "next", the metronome */}
      <div className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ScrollRow>
              {active.blocks.map((b, i) => {
                const Icon = BLOCK_ICON[b.kind];
                return (
                  <Chip key={b.kind} active={i === active.block} onClick={() => i !== active.block && session.goToBlock(i)} className="px-3 py-1.5">
                    <Icon /> {BLOCK_META[b.kind].title}
                  </Chip>
                );
              })}
            </ScrollRow>
          </div>
          <IconButton label="Завершить" onClick={() => setConfirmEnd(true)} className="size-10 shrink-0">
            <X />
          </IconButton>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold leading-tight">{title}</div>
            {block.entries.length > 1 && (
              <div className="text-xs text-muted">
                {index + 1} из {block.entries.length}
              </div>
            )}
          </div>
          <MetronomeButtons open={metronome} onOpen={setMetronome} />
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          {/* Time is counted in the background, per block: only how far the block is, no clock. */}
          <Progress
            aria-label={`${BLOCK_META[block.kind].title}: время блока`}
            className="h-2 min-w-0 flex-1"
            indicatorClassName={over ? "bg-good" : running ? "bg-accent" : "bg-muted"}
            value={Math.min(1, spent / (planned || 1)) * 100}
          />
          <IconButton label={running ? "Остановить время" : "Продолжить время"} onClick={togglePause} className="size-10 shrink-0">
            {running ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </IconButton>
          <Button onClick={next} title={`Дальше: ${nextTitle}`} className="h-10 min-w-0 max-w-[50%] shrink-0 gap-1 px-3">
            <span className="truncate">{lastEntry && isLast ? "Закончить" : "Дальше"}</span>
            {lastEntry && isLast ? <Check className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
        {!(lastEntry && isLast) && <div className="mt-1 truncate text-right text-xs text-muted">{nextTitle}</div>}
      </div>

      {metronome && (
        <div className="mb-3">
          <SessionMetronome />
        </div>
      )}

      <Practice key={entryKey} kind={block.kind} entry={entry} item={item} control={control} onBlocked={setBlocked} />

      {block.kind === "improv" && block.improv && (
        <div className="mt-3">
          <ImprovPanel task={block.improv} onChange={session.setImprov} />
        </div>
      )}

      <SoundBlocked show={blocked} onTap={() => setBlocked(false)} control={control} />

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
                stopMetronome();
                session.cancel();
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

/** The metronome: the icon turns it on and off, the gear opens its full panel under the header. */
export function MetronomeButtons({ open, onOpen }: { open: boolean; onOpen: (v: boolean) => void }) {
  const running = useMetronome((s) => s.running);
  const bpm = useMetronome((s) => s.bpm);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        variant={running ? "default" : "secondary"}
        aria-pressed={running}
        aria-label={running ? "Выключить метроном" : "Включить метроном"}
        title={running ? "Выключить метроном" : "Включить метроном"}
        onClick={() => {
          haptic();
          toggleMetronome();
        }}
        className="h-10 gap-1.5 px-3 tabular-nums"
      >
        <Metronome className="size-5" />
        {running && <span className="text-sm font-semibold">{bpm}</span>}
      </Button>
      <IconButton label="Настройки метронома" onClick={() => onOpen(!open)} className={cn("size-10", open && "bg-accent/15 text-accent")}>
        <Settings2 />
      </IconButton>
    </div>
  );
}

/** "Нажми, чтобы включить звук" when the browser refused to start a player without a tap. */
export function SoundBlocked({ show, onTap, control }: { show: boolean; onTap: () => void; control: RefObject<PlayerControl | null> }) {
  return (
    <AnimatePresence>
      {show && (
        <m.button
          type="button"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          onClick={() => {
            control.current?.resume();
            onTap();
          }}
          className="fixed inset-x-4 bottom-24 z-20 flex h-16 items-center justify-center gap-2 rounded-2xl bg-guide text-base font-bold text-on-accent shadow-lg"
        >
          <Volume2 className="size-6" /> Нажми, чтобы включить звук
        </m.button>
      )}
    </AnimatePresence>
  );
}

interface PracticeProps {
  kind: string;
  entry?: PlanEntry;
  item?: Item;
  control: RefObject<PlayerControl | null>;
  onBlocked: (b: boolean) => void;
}

/** One exercise: its materials (video, notes, neck — one at a time), the recorder. Keyed by the exercise. */
export function Practice({ kind, entry, item, control, onBlocked }: PracticeProps) {
  const materials = item ? materialsOf(item) : [];
  const [picked, setPicked] = useState<Material | undefined>(undefined);
  const material = picked && materials.includes(picked) ? picked : materials[0];
  if (kind === "improv") return null;
  return (
    <>
      {materials.length > 1 && (
        <Segmented className="mb-3" value={material!} onChange={setPicked} options={materials.map((value) => ({ value, label: MATERIAL_LABEL[value] }))} />
      )}
      <Stage entry={entry} item={item} material={material} control={control} onBlocked={onBlocked} />
      {item && hasBlock(item, "recorder") && (
        <RecordButton itemId={item.id} bpm={withMetronome(item) ? useMetronome.getState().bpm : null} className="mt-3 w-full" />
      )}
    </>
  );
}

interface StageProps {
  entry?: PlanEntry;
  item?: Item;
  material?: Material;
  control: RefObject<PlayerControl | null>;
  onBlocked: (b: boolean) => void;
}

/** What plays for the current exercise: the chosen material (video, notes, neck), or the card. Nothing starts on its own. */
function Stage({ entry, item, material, control, onBlocked }: StageProps) {
  if (!entry || !item) return null;
  if (material === "video" && item.video)
    return (
      <div className="space-y-3">
        <VideoPlayer key={item.id} itemId={item.id} video={item.video} playing={false} onBlocked={onBlocked} control={control} />
        <Description item={item} />
      </div>
    );
  if (material === "score") {
    if (item.tabFile || item.tab) return <NotesStage item={item} entry={entry} control={control} onBlocked={onBlocked} />;
    if (item.audioFile) return <AudioStage key={item.id} item={item} entry={entry} />;
  }
  return (
    <div className="space-y-3">
      {material === "board" && item.theory && <ItemBoard link={item.theory} />}
      <EntryCard entry={entry} />
    </div>
  );
}

/** The exercise's description under a video or a tab, which take the screen otherwise. */
function Description({ item }: { item: Item }) {
  const text = shownText(item);
  const shown = text.description ?? text.notes;
  return shown ? <p className="mt-2 whitespace-pre-wrap px-1 text-sm text-muted">{shown}</p> : null;
}

/** A recording without a tab: loops it at the chosen speed (pitch is kept), started from its own controls. */
function AudioStage({ item, entry }: { item: Item; entry: PlanEntry }) {
  const el = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    let u = "";
    void loadAudioFile(item.id).then((f) => {
      if (!f) return setUrl(null);
      u = URL.createObjectURL(audioBlob(f));
      setUrl(u);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [item.id]);
  useEffect(() => {
    if (el.current) el.current.playbackRate = speed;
  }, [speed, url]);
  if (url === null) return <EntryCard entry={entry} />;
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-3xl border border-line bg-surface p-3">
        {url && <audio ref={el} src={url} loop controls preload="auto" className="w-full" />}
        <TempoBar
          label={`${Math.round(speed * 100)}%`}
          onMinus={() => setSpeed((s) => Math.max(0.5, +(s - 0.05).toFixed(2)))}
          onPlus={() => setSpeed((s) => Math.min(1.25, +(s + 0.05).toFixed(2)))}
        />
      </div>
      <EntryCard entry={entry} />
    </div>
  );
}

function TempoBar({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <IconButton label="Медленнее" onClick={onMinus}>
        <Minus />
      </IconButton>
      <div className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-surface-2/50 text-lg font-bold tabular-nums">{label}</div>
      <IconButton label="Быстрее" onClick={onPlus}>
        <Plus />
      </IconButton>
    </div>
  );
}

/**
 * The notes with their buttons on top, as in the item's card: track, view (tab / notes / both), the recording or
 * the synthesizer, play. A Guitar Pro file loops the section's bars; a text tab follows the metronome's tempo.
 */
function NotesStage({ item, entry, control, onBlocked }: { item: Item; entry: PlanEntry; control: StageProps["control"]; onBlocked: (b: boolean) => void }) {
  const [file, setFile] = useState<ArrayBuffer | null | undefined>(item.tabFile ? undefined : null);
  const [recording, setRecording] = useState<ArrayBuffer | null>(null);
  const [recordingLoaded, setRecordingLoaded] = useState(!item.audioFile);
  const [useRecording, setUseRecording] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.75);
  const [score, setScore] = useState<ScoreInfo | null>(null);
  const [track, setTrack] = useState(0);
  const tabView = useSettings((s) => s.tabView);
  const setTabView = useSettings((s) => s.setTabView);
  const bpm = useMetronome((s) => s.bpm);
  const section = findSection(item, entry.sectionId);
  useEffect(() => {
    if (item.tabFile) void loadTabFile(item.id).then((f) => setFile(f ?? null));
    if (item.audioFile)
      void loadAudioFile(item.id).then((f) => {
        setRecording(f ?? null);
        setRecordingLoaded(true);
      });
  }, [item.id, item.tabFile, item.audioFile]);
  // The metronome follows the file at the chosen speed, so turning it on clicks along.
  const tempo = file ? (score?.tempo ?? 0) : 0;
  useEffect(() => {
    if (tempo) useMetronome.getState().set({ bpm: clampBpm(tempo * speed) });
  }, [tempo, speed]);

  const fromFile = !!file;
  if (file === null && !item.tab) return <EntryCard entry={entry} />;
  // Wait for the recording too, so the player is built once with everything (see MediaCard).
  const ready = fromFile ? recordingLoaded : file === null;
  const View = VIEW_META[tabView];
  const withRecording = fromFile && !!recording;
  return (
    <div>
      <div className="relative">
        {ready ? (
          <Suspense fallback={<div className="animate-pulse rounded-3xl border border-line bg-surface" style={{ height: TAB_HEIGHT }} />}>
            <TabPlayer
              tex={fromFile ? undefined : item.tab}
              file={file ?? undefined}
              audio={withRecording && useRecording ? recording : null}
              sync={item.audioSync}
              unrepeat={item.audioUnrepeat}
              skip={item.audioSkip}
              bpm={fromFile ? undefined : bpm}
              speed={fromFile ? speed : undefined}
              playing={playing}
              track={track}
              loopBars={fromFile ? (section?.bars ?? null) : null}
              height={TAB_HEIGHT}
              control={control}
              onBlocked={onBlocked}
              onScore={setScore}
            />
          </Suspense>
        ) : (
          <div className="animate-pulse rounded-3xl border border-line bg-surface" style={{ height: TAB_HEIGHT }} />
        )}
        {/* Clear of the tab's own scrollbar on the right; see-through (ON_TAB) so the notes show. */}
        <div className="absolute right-6 top-2 z-10 flex gap-1.5">
          {score && score.tracks.length > 1 && (
            <Select value={String(track)} onValueChange={(v) => setTrack(Number(v))}>
              <SelectTrigger aria-label="Дорожка" title="Дорожка" className={cn("h-10 w-auto max-w-36 rounded-xl border-0 bg-surface-2 px-3 text-xs font-semibold", ON_TAB)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {score.tracks.map((t, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="secondary"
            size="icon"
            aria-label={`Вид: ${View.name}. Переключить`}
            title={`${View.name} — нажми, чтобы переключить`}
            onClick={() => setTabView(VIEW_NEXT[tabView])}
            className={cn("h-10 w-[4.75rem] shrink-0 px-0", ON_TAB)}
          >
            {View.mark}
          </Button>
          {withRecording && (
            <Button
              variant="secondary"
              size="icon"
              aria-label={useRecording ? "Играет запись. Переключить на синтезатор" : "Играет синтезатор. Переключить на запись"}
              title={useRecording ? "Запись — нажми для синтезатора" : "Синтезатор — нажми для записи"}
              onClick={() => {
                setPlaying(false);
                setUseRecording(!useRecording);
              }}
              className={cn("size-10 shrink-0", ON_TAB)}
            >
              {useRecording ? <Headphones className="!size-4" /> : <Piano className="!size-4" />}
            </Button>
          )}
          <Button
            size="icon"
            aria-label={playing ? "Пауза" : "Играть"}
            title={playing ? "Пауза" : "Играть"}
            onClick={() => {
              audio();
              setPlaying(!playing);
            }}
            className={cn("size-10 shrink-0 shadow-none", ON_TAB)}
          >
            {playing ? <Pause fill="currentColor" className="!size-4" /> : <Play fill="currentColor" className="!size-4" />}
          </Button>
        </div>
      </div>
      {fromFile ? (
        <TempoBar
          label={`${Math.round(speed * 100)}%${tempo ? ` · ${Math.round(tempo * speed)} bpm` : ""}`}
          onMinus={() => setSpeed((s) => Math.max(0.25, +(s - 0.05).toFixed(2)))}
          onPlus={() => setSpeed((s) => Math.min(1.5, +(s + 0.05).toFixed(2)))}
        />
      ) : (
        <TempoBar
          label={`${bpm} bpm`}
          onMinus={() => useMetronome.getState().set({ bpm: clampBpm(bpm - 5) })}
          onPlus={() => useMetronome.getState().set({ bpm: clampBpm(bpm + 5) })}
        />
      )}
      {fromFile && section && !section.bars && (
        <p className="mt-2 px-1 text-xs text-muted">Раздел не привязан к тактам — играет весь файл. Привязать можно в карточке песни.</p>
      )}
      {(!fromFile || !section) && <Description item={item} />}
    </div>
  );
}
