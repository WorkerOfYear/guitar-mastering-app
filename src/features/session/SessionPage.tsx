import { Suspense, lazy, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Check, ChevronsRight, Metronome, Minus, Pause, Play, Plus, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import { CompactMetronome } from "@/components/metronome/MetronomePanel";
import { Button, IconButton, Progress, Segmented } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { BLOCK_ICON } from "@/components/ui/icons";
import { YouTubePlayer } from "@/components/video/YouTubePlayer";
import { ItemBoard } from "@/components/fretboard/ItemBoard";
import type { PlayerControl } from "@/components/tab/TabPlayer";
import { TabViewSwitch } from "@/components/tab/TabViewSwitch";
import { audio } from "@/audio/player";
import { signal, startMetronome, stopMetronome } from "@/audio/metronome";
import { haptic, tg } from "@/app/telegram";
import { ImprovPanel } from "@/features/improv/ImprovPanel";
import { formatClock, useNow, useWakeLock } from "@/lib/hooks";
import { localDate } from "@/lib/date";
import { findSection, startingBpm, unitTitle } from "@/lib/progress";
import { MATERIAL_LABEL, materialsOf, type Material } from "@/lib/library";
import { loadAudioFile, loadTabFile } from "@/lib/tabFiles";
import { audioBlob } from "@/lib/audioType";
import { SourceSwitch } from "@/features/library/MediaCard";
import { useData } from "@/store/data";
import { clampBpm, useMetronome } from "@/store/metronome";
import { blockSeconds, plannedSeconds, useSession } from "@/store/session";
import { BLOCK_META, type Item, type PlanEntry } from "@/shared/types";
import { EntryCard } from "./EntryCard";
import { ResultSheet } from "./ResultSheet";
import { SessionSummary } from "./SessionSummary";
import { entrySlots, slotAt, slotStart } from "./slots";

const TabPlayer = lazy(() => import("@/components/tab/TabPlayer"));

type Phase = "countdown" | "play" | "paused";
const COUNT_ENTRY = 3;
const COUNT_BLOCK = 5;
/** The tab takes the screen between the header and the tempo/transport bars. */
const TAB_HEIGHT = "max(16rem, calc(100dvh - 21rem))";

/** Click for the 3-2-1 count. */
function tick(accent = false) {
  const { ctx, out } = audio();
  const t = ctx.currentTime + 0.01;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.9, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.08);
}

/** Hands-free session: blocks and exercises switch on their own, each starts after a count-in. */
export function SessionPage() {
  const session = useSession();
  const { active, finished } = session;
  const data = useData();
  const now = useNow(250, !!active);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [count, setCount] = useState(COUNT_BLOCK);
  const [blocked, setBlocked] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const control = useRef<PlayerControl | null>(null);
  useWakeLock(!!active);

  const block = active?.blocks[active.block];
  const planned = active ? plannedSeconds(active, active.block) : 0;
  const spent = active ? blockSeconds(active, active.block, now) : 0;
  const slots = block ? entrySlots(block, data.items, planned) : [0];
  const slot = slotAt(slots, spent);
  const entry: PlanEntry | undefined = block?.entries[slot.index];
  const item = entry ? data.items.find((i) => i.id === entry.itemId) : undefined;
  const slotKey = active ? `${active.id}:${active.block}:${slot.index}` : "";
  const isLast = !!active && active.block === active.blocks.length - 1;
  const isFirstOfBlock = slot.index === 0;

  // New exercise or block → pause the clock, count in, then play.
  const [countKey, setCountKey] = useState(0);
  useEffect(() => {
    if (!active) return;
    setBlocked(false);
    stopMetronome();
    if (entry) {
      const it = data.items.find((i) => i.id === entry.itemId);
      useMetronome.getState().set({
        bpm: startingBpm(data.log, it, entry, localDate()),
        ...(it?.subdivision ? { subdivision: it.subdivision } : {}),
      });
    }
    if (phase === "paused") return;
    setCount(isFirstOfBlock ? COUNT_BLOCK : COUNT_ENTRY);
    setPhase("countdown");
    session.pause();
    setCountKey((k) => k + 1);
  }, [slotKey]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) {
      session.resume();
      setPhase("play");
      return;
    }
    if (count <= 3) tick(count === 1);
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, countKey]);

  // An exercise with several materials (video, tab, neck) shows one at a time; each new exercise opens on its first.
  const materials = item ? materialsOf(item) : [];
  const [picked, setPicked] = useState<{ slot: string; material: Material } | null>(null);
  const material = picked?.slot === slotKey && materials.includes(picked.material) ? picked.material : materials[0];

  // Plain exercises (just a description or the neck) and improvisation play along with the metronome.
  const usesMetronome = !!block && (block.kind === "improv" || (!!item && (!material || material === "board")));
  useEffect(() => {
    if (phase === "play" && usesMetronome) startMetronome();
    else stopMetronome();
  }, [phase, usesMetronome, slotKey]);

  // End of the block → next block (or the summary).
  useEffect(() => {
    if (!active || phase !== "play" || spent < planned) return;
    signal();
    navigator.vibrate?.([200, 100, 200]);
    tg?.HapticFeedback?.impactOccurred("heavy");
    if (isLast) finish();
    else session.goToBlock(active.block + 1);
  }, [phase, spent >= planned]);

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
    if (phase === "paused") {
      setCount(COUNT_ENTRY);
      setPhase("countdown");
      setCountKey((k) => k + 1);
    } else {
      session.pause();
      setPhase("paused");
    }
  };
  const skip = () => {
    haptic();
    if (slot.index < slots.length - 1) session.seek(slotStart(slots, slot.index + 1));
    else if (isLast) finish();
    else session.goToBlock(active.block + 1);
  };
  // Back: to the start of this exercise, or (right after it began) to the previous one.
  const back = () => {
    haptic();
    if (spent - slot.start > 5) session.seek(slot.start);
    else if (slot.index > 0) session.seek(slotStart(slots, slot.index - 1));
    else if (active.block > 0) session.goToBlock(active.block - 1);
    else session.seek(0);
  };

  const playing = phase === "play";
  const nextTitle =
    slot.index < block.entries.length - 1
      ? unitTitle(
          data.items.find((i) => i.id === block.entries[slot.index + 1].itemId),
          block.entries[slot.index + 1].sectionId,
        )
      : !isLast
        ? BLOCK_META[active.blocks[active.block + 1].kind].title
        : "Конец занятия";
  // Section first: "Intro — Technical Difficulties" stays readable when truncated.
  const section = findSection(item, entry?.sectionId);
  const BlockIcon = BLOCK_ICON[block.kind];
  const title = block.kind === "improv" ? "Импровизация" : section ? `${section.title} — ${item?.title}` : item ? item.title : BLOCK_META[block.kind].title;

  return (
    <div className="pb-28">
      {/* header: blocks, current exercise, its clock */}
      <div className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex gap-1.5">
          {active.blocks.map((b, i) => (
            <Progress
              key={b.kind}
              aria-label={BLOCK_META[b.kind].title}
              className="h-1.5 flex-1"
              indicatorClassName={i === active.block ? "bg-accent" : "bg-muted"}
              value={Math.min(1, blockSeconds(active, i, now) / plannedSeconds(active, i)) * 100}
            />
          ))}
        </div>
        <div className="mt-3 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate text-xs text-muted">
              <BlockIcon className="size-3.5 shrink-0 text-accent" />
              <span className="truncate">
                {BLOCK_META[block.kind].title}
                {block.entries.length > 1 && ` · ${slot.index + 1} из ${block.entries.length}`} · блок {formatClock(planned - spent)}
              </span>
            </div>
            <div className="mt-0.5 truncate text-lg font-bold leading-tight">{title}</div>
          </div>
          <div className={`text-right text-4xl font-bold leading-none tabular-nums tracking-tight ${phase === "paused" ? "text-muted" : ""}`}>
            {formatClock(slot.end - spent)}
          </div>
        </div>
        <Progress className="mt-2.5 h-1" value={Math.min(1, (spent - slot.start) / (slot.end - slot.start || 1)) * 100} />
      </div>

      {block.kind !== "improv" && materials.length > 1 && (
        <Segmented
          className="mb-3"
          value={material!}
          onChange={(v) => setPicked({ slot: slotKey, material: v })}
          options={materials.map((value) => ({ value, label: MATERIAL_LABEL[value] }))}
        />
      )}
      <Stage block={block.kind} entry={entry} item={item} material={material} playing={playing} control={control} onBlocked={setBlocked} />

      {block.kind === "improv" && block.improv && (
        <div className="mt-3">
          <ImprovPanel task={block.improv} onChange={session.setImprov} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 px-1 text-xs text-muted">
        <ChevronsRight className="size-4 shrink-0" />
        <span className="truncate">Дальше: {nextTitle}</span>
      </div>

      {/* transport */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
          <IconButton label="Завершить" onClick={() => setConfirmEnd(true)}>
            <X />
          </IconButton>
          <IconButton label="Назад" onClick={back}>
            <SkipBack />
          </IconButton>
          <Button size="lg" onClick={togglePause} aria-label={phase === "paused" ? "Продолжить" : "Пауза"} className="flex-1">
            {phase === "paused" ? <Play className="size-7" fill="currentColor" /> : <Pause className="size-7" fill="currentColor" />}
          </Button>
          <IconButton label="Пропустить" onClick={skip}>
            <SkipForward />
          </IconButton>
          {entry && (
            <IconButton label="Записать результат" onClick={() => setSheet(true)} className="bg-good/15 text-good">
              <Check />
            </IconButton>
          )}
        </div>
      </div>

      <AnimatePresence>
        {phase === "countdown" && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-bg/85 backdrop-blur-md"
            onClick={togglePause}
          >
            <div className="flex items-center gap-1.5 text-sm text-muted">
              {isFirstOfBlock ? (
                <>
                  <BlockIcon className="size-4 text-accent" /> {BLOCK_META[block.kind].title}
                </>
              ) : (
                "Следующее упражнение"
              )}
            </div>
            <div className="mt-1 max-w-[90%] text-center text-2xl font-bold">{title}</div>
            <div className="relative mt-8 flex size-40 items-center justify-center">
              <m.div
                key={`ring-${countKey}-${count}`}
                className="absolute inset-0 rounded-full border-4 border-accent"
                initial={{ scale: 0.7, opacity: 0.7 }}
                animate={{ scale: 1.25, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
              <AnimatePresence mode="popLayout">
                <m.div
                  key={count}
                  initial={{ scale: 1.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="text-9xl font-bold tabular-nums text-accent"
                >
                  {Math.max(1, count)}
                </m.div>
              </AnimatePresence>
            </div>
            <div className="mt-8 flex items-center gap-1.5 text-xs text-muted">
              <Pause className="size-3.5" /> Нажми, чтобы поставить на паузу
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {blocked && playing && (
          <m.button
            type="button"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => {
              control.current?.resume();
              setBlocked(false);
            }}
            className="fixed inset-x-4 bottom-24 z-20 flex h-16 items-center justify-center gap-2 rounded-2xl bg-guide text-base font-bold text-on-accent shadow-lg"
          >
            <Volume2 className="size-6" /> Нажми, чтобы включить звук
          </m.button>
        )}
      </AnimatePresence>

      {entry && <ResultSheet open={sheet} entry={entry} bpm={useMetronome.getState().bpm} onClose={() => setSheet(false)} />}

      <Drawer open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Завершить занятие?</DrawerTitle>
            <DrawerDescription>Прошло {formatClock(active.blocks.reduce((sum, _, i) => sum + blockSeconds(active, i, now), 0))}</DrawerDescription>
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
            <Button size="lg" variant="ghost" onClick={() => setConfirmEnd(false)} className="w-full">
              Продолжить занятие
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

interface StageProps {
  block: string;
  entry?: PlanEntry;
  item?: Item;
  material?: Material;
  playing: boolean;
  control: RefObject<PlayerControl | null>;
  onBlocked: (b: boolean) => void;
}

/** What plays for the current exercise: the chosen material (video, notes, neck), or the card with a metronome. */
function Stage({ block, entry, item, material, playing, control, onBlocked }: StageProps) {
  if (block === "improv") return <CompactMetronome />;
  if (!entry || !item) return null;
  const songKey = `${item.id}#${entry.sectionId ?? ""}`;
  if (material === "video" && item.video)
    return (
      <div className="space-y-3">
        <YouTubePlayer key={item.id} videoId={item.video.youtubeId} start={item.video.start} playing={playing} onBlocked={onBlocked} control={control} />
        <Description item={item} />
      </div>
    );
  if (material === "notes") {
    // A Guitar Pro file with its recording comes first: the notes follow the sound.
    if (item.tabFile && item.audioFile) return <SongStage key={songKey} item={item} entry={entry} playing={playing} control={control} onBlocked={onBlocked} />;
    if (item.tab) return <TabStage key={item.id} item={item} playing={playing} control={control} onBlocked={onBlocked} />;
    if (item.tabFile) return <SongStage key={songKey} item={item} entry={entry} playing={playing} control={control} onBlocked={onBlocked} />;
    if (item.audioFile) return <AudioStage key={item.id} item={item} entry={entry} playing={playing} control={control} onBlocked={onBlocked} />;
  }
  return (
    <div className="space-y-3">
      {material === "board" && item.theory && <ItemBoard link={item.theory} />}
      <EntryCard entry={entry} />
      <CompactMetronome />
    </div>
  );
}

/** The exercise's description under a video or a tab, which take the screen otherwise. */
function Description({ item }: { item: Item }) {
  return item.description ? <p className="mt-2 whitespace-pre-wrap px-1 text-sm text-muted">{item.description}</p> : null;
}

/** A recording without a tab: loops it at the chosen speed (pitch is kept). */
function AudioStage({
  item,
  entry,
  playing,
  control,
  onBlocked,
}: {
  item: Item;
  entry: PlanEntry;
  playing: boolean;
  control: StageProps["control"];
  onBlocked: (b: boolean) => void;
}) {
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
    const a = el.current;
    if (!a) return;
    control.current = { resume: () => void a.play() };
    if (!playing) return a.pause();
    // Mobile browsers may refuse to start audio without a tap.
    a.play().then(
      () => onBlocked(false),
      () => onBlocked(true),
    );
  }, [playing, url]);
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

function TempoBar({ label, onMinus, onPlus, extra }: { label: string; onMinus: () => void; onPlus: () => void; extra?: ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <IconButton label="Медленнее" onClick={onMinus}>
        <Minus />
      </IconButton>
      <div className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-surface-2/50 text-lg font-bold tabular-nums">{label}</div>
      <IconButton label="Быстрее" onClick={onPlus}>
        <Plus />
      </IconButton>
      {extra}
    </div>
  );
}

function MetronomeToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Button variant={on ? "default" : "secondary"} onClick={() => onChange(!on)} aria-pressed={on} className={`h-11 px-3 ${on ? "" : "text-muted"}`}>
      <Metronome /> клик
    </Button>
  );
}

function TabStage({ item, playing, control, onBlocked }: { item: Item; playing: boolean; control: StageProps["control"]; onBlocked: (b: boolean) => void }) {
  const bpm = useMetronome((s) => s.bpm);
  const [click, setClick] = useState(true);
  return (
    <div>
      <Suspense fallback={<div className="animate-pulse rounded-3xl border border-line bg-surface" style={{ height: TAB_HEIGHT }} />}>
        <TabPlayer tex={item.tab} height={TAB_HEIGHT} bpm={bpm} playing={playing} metronome={click} control={control} onBlocked={onBlocked} />
      </Suspense>
      <TempoBar
        label={`${bpm} bpm`}
        onMinus={() => useMetronome.getState().set({ bpm: clampBpm(bpm - 5) })}
        onPlus={() => useMetronome.getState().set({ bpm: clampBpm(bpm + 5) })}
        extra={<MetronomeToggle on={click} onChange={setClick} />}
      />
      <div className="mt-2">
        <TabViewSwitch />
      </div>
      <Description item={item} />
    </div>
  );
}

function SongStage({
  item,
  entry,
  playing,
  control,
  onBlocked,
}: {
  item: Item;
  entry: PlanEntry;
  playing: boolean;
  control: StageProps["control"];
  onBlocked: (b: boolean) => void;
}) {
  const [file, setFile] = useState<ArrayBuffer | null | undefined>(undefined);
  const [audio, setAudio] = useState<ArrayBuffer | null>(null);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [useRecording, setUseRecording] = useState(true);
  const [speed, setSpeed] = useState(0.75);
  const [click, setClick] = useState(false);
  const [tempo, setTempo] = useState(0);
  const section = findSection(item, entry.sectionId);
  useEffect(() => {
    void loadTabFile(item.id).then((f) => setFile(f ?? null));
    if (item.audioFile)
      void loadAudioFile(item.id).then((f) => {
        setAudio(f ?? null);
        setAudioLoaded(true);
      });
  }, [item.id, item.audioFile]);
  // Keep the "record result" tempo in sync with what's actually playing.
  useEffect(() => {
    if (tempo) useMetronome.getState().set({ bpm: clampBpm(tempo * speed) });
  }, [tempo, speed]);
  if (file === null) return <EntryCard entry={entry} />;
  // Wait for the recording too, so the player is built once with everything (see MediaCard).
  const ready = !!file && (!item.audioFile || audioLoaded);
  return (
    <div>
      {ready && (
        <Suspense fallback={<div className="animate-pulse rounded-3xl border border-line bg-surface" style={{ height: TAB_HEIGHT }} />}>
          <TabPlayer
            file={file!}
            audio={useRecording ? audio : null}
            sync={item.audioSync}
            unrepeat={item.audioUnrepeat}
            height={TAB_HEIGHT}
            speed={speed}
            playing={playing}
            loopBars={section?.bars ?? null}
            metronome={click}
            control={control}
            onBlocked={onBlocked}
            onScore={(s) => setTempo(s.tempo)}
          />
        </Suspense>
      )}
      <TempoBar
        label={`${Math.round(speed * 100)}%${tempo ? ` · ${Math.round(tempo * speed)} bpm` : ""}`}
        onMinus={() => setSpeed((s) => Math.max(0.25, +(s - 0.05).toFixed(2)))}
        onPlus={() => setSpeed((s) => Math.min(1.5, +(s + 0.05).toFixed(2)))}
        extra={<MetronomeToggle on={click} onChange={setClick} />}
      />
      <div className="mt-2 space-y-2">
        <TabViewSwitch />
        {audio && <SourceSwitch recording={useRecording} onChange={setUseRecording} />}
      </div>
      {section && !section.bars && (
        <p className="mt-2 px-1 text-xs text-muted">Раздел не привязан к тактам — играет весь файл. Привязать можно в карточке песни.</p>
      )}
      {!section && <Description item={item} />}
    </div>
  );
}
