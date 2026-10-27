import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Download,
  FileMusic,
  Globe,
  Grid3x3,
  Music2,
  Pencil,
  Headphones,
  Link2,
  ListTree,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Piano,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Video,
  WandSparkles,
} from "lucide-react";
import { Badge, Button, Card, Input, Segmented, buttonVariants } from "@/components/ui";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { DEFAULT_BOARD, TheoryPicker } from "@/components/fretboard/TheoryPicker";
import { choiceOf, theoryView } from "@/music/theoryView";
import type { ScoreInfo } from "@/components/tab/TabPlayer";
import { TabViewSwitch } from "@/components/tab/TabViewSwitch";
import { audio } from "@/audio/player";
import { cacheAudioFile, deleteAudioFile, deleteInstagramVideo, deleteTabFile, loadAudioFile, loadTabFile, saveAudioFile, saveTabFile } from "@/lib/tabFiles";
import { audioBlob, downloadAudio } from "@/lib/audioType";
import { detectSync } from "./AudioSync";
import { SectionStrip } from "./SectionStrip";
import { TabSearch } from "./TabSearch";
import { songQuery } from "@/lib/titles";
import { fetchVideoAudio } from "@/lib/youtubeAudio";
import { useAuth } from "@/store/auth";
import { fetchScore, museScoreLink, type ScoreFormat } from "@/lib/scoreDownload";
import { useSettings } from "@/store/settings";
import { useData } from "@/store/data";
import { cn } from "@/lib/utils";
import type { Item, Section } from "@/shared/types";

const TabPlayer = lazy(() => import("@/components/tab/TabPlayer"));
const SyncDialog = lazy(() => import("./SyncDialog"));

/** Buttons lying on the tabs: 70% visible so the notes under them show, each solid on its own under the pointer,
 *  with keyboard focus or while open (the track list). */
const ON_TAB = "opacity-70 transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100";

/** The view switch is one button that steps tab → notes → both, marked the way music is: "TAB", a note, both. */
const VIEW_NEXT = { tab: "score", score: "both", both: "tab" } as const;
// The note and "TAB" are drawn the same height in every view, centred on one line, so switching doesn't jump.
const TabMark = () => <span className="text-[13px] font-semibold leading-none">TAB</span>;
const NoteMark = () => <Music2 className="!size-[15px]" />;
const VIEW_META = {
  tab: { mark: <TabMark />, name: "Табы" },
  score: { mark: <NoteMark />, name: "Ноты" },
  both: {
    mark: (
      <span className="flex items-center gap-1">
        <NoteMark />
        <span className="text-[13px] font-medium leading-none text-muted">+</span>
        <TabMark />
      </span>
    ),
    name: "Ноты и табы",
  },
} as const;

import { withScheme } from "@/lib/youtubeLink";
import { parseVideo, videoShortUrl, videoSite } from "@/lib/videoLink";

/** The original recording or the synthesizer. */
export function SourceSwitch({ recording, onChange }: { recording: boolean; onChange: (v: boolean) => void }) {
  return (
    <Segmented
      size="sm"
      value={recording ? "rec" : "synth"}
      onChange={(v) => onChange(v === "rec")}
      options={[
        {
          value: "rec",
          label: (
            <>
              <Headphones /> Запись
            </>
          ),
        },
        {
          value: "synth",
          label: (
            <>
              <Piano /> Синтезатор
            </>
          ),
        },
      ]}
    />
  );
}

/** Tabs and scores alphaTab opens: Guitar Pro, MusicXML (MuseScore exports it), compressed MusicXML, Capella. */
export const TAB_ACCEPT = ".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.xml,.musicxml,.mxl,.capx";
export const TAB_MAX = 5_000_000;
export const AUDIO_ACCEPT = "audio/*,.mp3,.m4a,.wav,.ogg,.flac";
export const AUDIO_MAX = 40_000_000;

const ICON = "flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent [&_svg]:size-[18px]";

/** What the check found when the recording was bound to the tab (another tuning, another song…). */
function MatchWarnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return (
    <div className="flex gap-2 rounded-2xl bg-guide/15 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-guide" />
      <div className="space-y-1">
        <div className="font-semibold">Запись не сходится с табами</div>
        {warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </div>
    </div>
  );
}

/** One material: icon, what it is, then the same icon actions everywhere (replace, delete). */
function MaterialRow({ icon, title, sub, actions }: { icon: ReactNode; title: string; sub?: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2/50 py-2 pl-3 pr-1.5">
      <span className={ICON}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      {actions}
    </div>
  );
}

const addClass =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 active:scale-[0.99] [&_svg]:size-[18px]";

/** A missing material: dashed row; a button, or a file picker when `accept` is given. */
function AddRow({
  icon,
  title,
  sub,
  accept,
  onFile,
  onClick,
  busy,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  accept?: string;
  onFile?: (f: File) => void;
  onClick?: () => void;
  busy?: boolean;
}) {
  const inner = (
    <>
      <span className="shrink-0 text-muted">{busy ? <LoaderCircle className="animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      <Plus className="shrink-0 text-muted" />
    </>
  );
  if (accept)
    return (
      <label className={addClass}>
        {inner}
        <input type="file" accept={accept} hidden onChange={(e) => e.target.files?.[0] && onFile?.(e.target.files[0])} />
      </label>
    );
  return (
    <button type="button" disabled={busy} onClick={onClick} className={addClass}>
      {inner}
    </button>
  );
}

/** `active`: a toggle that is on (its panel is open) — shown pressed. */
function IconAction({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(active && "bg-accent/15 text-accent hover:bg-accent/20")}
    >
      {children}
    </Button>
  );
}

/** Replace-with-a-file action, same look as the other icon actions. */
function FileAction({ label, accept, onFile }: { label: string; accept: string; onFile: (f: File) => void }) {
  return (
    <label
      aria-label={label}
      title={label}
      className="flex size-9 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <RefreshCw className="size-4" />
      <input type="file" accept={accept} hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

/**
 * Video, tabs and recording of an item: the players up front, everything else in the "Материалы" sheet.
 * `part` "score": the "Табы и ноты" block — the tabs or notes, their sections, the file and the sound bound to them
 * (the video and the neck are blocks of their own).
 */
export function MediaCard({ item, part = "all" }: { item: Item; part?: "all" | "score" }) {
  const scoreOnly = part !== "all";
  const { updateItem } = useData();
  const [file, setFile] = useState<ArrayBuffer | null>(null);
  const fileRef = useRef<ArrayBuffer | null>(null);
  fileRef.current = file;
  const [audioData, setAudioData] = useState<ArrayBuffer | null>(null);
  // The item says a file exists, but this device doesn't have it (another device, a restored backup).
  const [missing, setMissing] = useState({ tab: false, audio: false });
  const [useRecording, setUseRecording] = useState(true);
  const [score, setScore] = useState<ScoreInfo | null>(null);
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (item.tabFile)
      void loadTabFile(item.id).then((f) => {
        setFile(f ?? null);
        setMissing((m) => ({ ...m, tab: !f }));
      });
  }, [item.id, item.tabFile]);
  useEffect(() => {
    if (item.audioFile)
      void loadAudioFile(item.id).then((f) => {
        setAudioData(f ?? null);
        setMissing((m) => ({ ...m, audio: !f }));
      });
  }, [item.id, item.audioFile]);

  // Create the player only once both the tab and its recording are read: building it with the tab
  // alone and rebuilding a moment later (when the recording arrives) left alphaTab half-initialised,
  // and the next play froze the page.
  const mediaReady = !item.audioFile || audioData !== null || missing.audio;
  const hasTab = !!(item.tab || file);

  /** A new recording: sync the tab to it right away when there is one. `storedAt`: the server already keeps it. */
  const setRecording = async (data: ArrayBuffer, meta: NonNullable<Item["audioFile"]>, storedAt?: number | null) => {
    if (storedAt) await cacheAudioFile(item.id, data, storedAt);
    else await saveAudioFile(item.id, data);
    setAudioData(data);
    setMissing((m) => ({ ...m, audio: false }));
    setPlaying(false);
    updateItem(item.id, { audioFile: meta, audioSync: undefined, audioUnrepeat: undefined, audioWarnings: undefined });
    const tab = fileRef.current ?? (item.tabFile ? await loadTabFile(item.id) : null);
    if (!tab) return;
    const id = toast.loading("Связываю табы с записью…");
    try {
      const r = await detectSync(tab, data);
      updateItem(item.id, r.patch);
      const title = r.ok ? "Табы связаны с записью" : r.warnings.length ? "Запись не сходится с табами" : "Табы связаны, но не уверенно";
      (r.ok ? toast.success : toast.warning)(title, { id, description: r.message, duration: r.warnings.length ? 12_000 : undefined });
    } catch (e) {
      toast.error("Не удалось связать табы с записью", { id, description: (e as Error).message });
    }
  };

  const uploadAudio = async (f: File) => {
    if (f.size > AUDIO_MAX) return toast.error("Аудио больше 40 МБ — сожми его в mp3");
    await setRecording(await f.arrayBuffer(), { name: f.name, size: f.size });
  };

  // The recording taken from the item's video by the owner's server (it keeps the file right away).
  const audioReady = useAuth((s) => s.server.audio);
  const [grabbing, setGrabbing] = useState(false);
  const [grabAttempt, setGrabAttempt] = useState(1);
  const grabAudio = async () => {
    if (!item.video) return;
    if (!audioReady) return toast.error("Сервер звука не подключён к API — см. server/api/README.md");
    setGrabbing(true);
    try {
      const { data, name, updatedAt } = await fetchVideoAudio(item.video, item.id, setGrabAttempt);
      await setRecording(data, { name, size: data.byteLength, fromVideo: true }, updatedAt);
    } catch (e) {
      toast.error("Не удалось взять звук из видео", { description: (e as Error).message });
    } finally {
      setGrabbing(false);
    }
  };
  // Right after creating an item with a video: take its sound without asking.
  const location = useLocation();
  const autoGrab = useRef((location.state as { grabAudio?: boolean } | null)?.grabAudio);
  useEffect(() => {
    if (!autoGrab.current) return;
    autoGrab.current = false;
    void grabAudio();
  }, []);

  // Sheet music from the MuseScore link attached to the item, taken by the user's server (server/score-download).
  const scoreReady = useAuth((s) => s.server.score);
  const scoreLink = museScoreLink(item.links);
  const [scoreBusy, setScoreBusy] = useState<ScoreFormat | null>(null);
  const grabScore = async (format: ScoreFormat) => {
    if (!scoreLink) return;
    if (!scoreReady) return toast.error("Сервер нот MuseScore не подключён к API — см. server/api/README.md");
    setScoreBusy(format);
    try {
      const { data, name } = await fetchScore(scoreLink, format);
      if (format === "mp3") return await setRecording(data, { name, size: data.byteLength });
      if (format === "musicxml") return await setTab(data, name);
      const url = URL.createObjectURL(new Blob([data]));
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error("Не удалось скачать с MuseScore", { description: (e as Error).message });
    } finally {
      setScoreBusy(null);
    }
  };

  const removeAudio = async () => {
    await deleteAudioFile(item.id);
    setAudioData(null);
    setPlaying(false);
    updateItem(item.id, { audioFile: undefined, audioSync: undefined, audioUnrepeat: undefined, audioWarnings: undefined });
  };

  const setTab = async (data: ArrayBuffer, name: string) => {
    await saveTabFile(item.id, data);
    setFile(data);
    setMissing((m) => ({ ...m, tab: false }));
    setScore(null);
    // Another tab: what the check said about the old one no longer holds.
    updateItem(item.id, { tabFile: { name, size: data.byteLength }, audioWarnings: undefined });
  };

  const upload = async (f: File) => {
    if (f.size > TAB_MAX) return toast.error("Файл больше 5 МБ — это точно табы?");
    await setTab(await f.arrayBuffer(), f.name);
  };

  // Tabs and scores for this item online: each opens on its site.
  const [findScore, setFindScore] = useState(false);
  const findRow = findScore ? (
    <div className="space-y-2 rounded-2xl bg-surface-2/50 p-3">
      <TabSearch query={songQuery(item.title)} auto />
      <Button variant="ghost" size="sm" onClick={() => setFindScore(false)} className="w-full text-muted">
        Скрыть поиск
      </Button>
    </div>
  ) : (
    <AddRow icon={<Globe />} title="Найти ноты в интернете" sub="Songsterr, UG, MuseScore" onClick={() => setFindScore(true)} />
  );

  const removeFile = async () => {
    await deleteTabFile(item.id);
    setFile(null);
    setScore(null);
    updateItem(item.id, { tabFile: undefined, audioWarnings: undefined });
  };

  const [videoUrl, setVideoUrl] = useState("");
  const [editVideo, setEditVideo] = useState(false);
  const [editBoard, setEditBoard] = useState(false);
  const saveVideo = () => {
    const v = parseVideo(videoUrl);
    if (!v) return toast.error("Не похоже на ссылку YouTube или Instagram");
    const url = withScheme(videoUrl);
    if (item.video?.instagramId && item.video.instagramId !== v.instagramId) void deleteInstagramVideo(item.id, item.video.instagramId);
    updateItem(item.id, { video: v, links: item.links.includes(url) ? item.links : [...item.links, url] });
    setVideoUrl("");
    setEditVideo(false);
  };

  /** Sections from the file's markers: each runs until the next marker. */
  const sectionsFromFile = () => {
    if (!score?.sections.length) return;
    const sections: Section[] = score.sections.map((s, i) => {
      const prev = item.sections?.find((x) => x.title === s.title);
      return {
        id: prev?.id ?? `m${s.bar}`,
        title: s.title,
        status: prev?.status ?? "queue",
        targetBpm: prev?.targetBpm ?? null,
        bars: [s.bar, (score.sections[i + 1]?.bar ?? score.bars + 1) - 1],
      };
    });
    if (!sections.some((s) => s.status === "active")) sections[0].status = "active";
    updateItem(item.id, { sections, type: "song" });
  };

  // A song without sections takes them from the file's markers as soon as the file is read
  // (once per file, so deleting them all doesn't bring them back).
  const noSections = !item.sections?.length;
  const autoSections = useRef("");
  useEffect(() => {
    if (!score?.sections.length || !noSections || autoSections.current === item.tabFile?.name) return;
    autoSections.current = item.tabFile?.name ?? "";
    sectionsFromFile();
  }, [score, noSections]);

  const synced = !!item.audioSync?.length;
  const sectionCount = item.sections?.length ?? 0;
  const empty = !item.tabFile && !item.tab && !item.audioFile && (scoreOnly || (!item.video && !item.theory));
  const [showSync, setShowSync] = useState(false);
  // Syncing opens a window of its own (the notes and the recording's timeline together).
  const syncDialog = showSync && file && audioData && (
    <Suspense fallback={null}>
      <SyncDialog
        open
        onOpenChange={setShowSync}
        item={item}
        audio={audioData}
        tab={file}
        track={track}
        sections={score?.sections ?? []}
        bars={score?.bars ?? 1}
        barMs={score?.barMs ?? []}
      />
    </Suspense>
  );
  const audioInput = useRef<HTMLInputElement>(null);
  const tabView = useSettings((s) => s.tabView);
  const setTabView = useSettings((s) => s.setTabView);

  const badges = (
    <>
      {item.theory && !scoreOnly && (
        <Badge variant="soft">
          <Grid3x3 /> гриф
        </Badge>
      )}
      {item.video && !scoreOnly && (
        <Badge variant="soft">
          <Video /> видео
        </Badge>
      )}
      {item.tabFile && (
        <Badge variant={missing.tab ? "outline" : "soft"}>
          <FileMusic /> {missing.tab ? "табы не на этом устройстве" : sectionCount ? `табы · разделов: ${sectionCount}` : "табы"}
        </Badge>
      )}
      {grabbing ? (
        <Badge variant="secondary">
          <LoaderCircle className="animate-spin" /> беру звук из видео
        </Badge>
      ) : item.audioFile && missing.audio ? (
        <Badge variant="outline">
          <Headphones /> запись не на этом устройстве
        </Badge>
      ) : item.audioFile && hasTab && synced ? (
        <Badge variant="good">
          <Link2 /> {item.audioFile.fromVideo ? "табы идут за видео" : "табы идут за записью"}
        </Badge>
      ) : item.audioFile ? (
        <Badge variant="soft">
          <Headphones /> {item.audioFile.fromVideo ? "звук из видео" : "запись"}
        </Badge>
      ) : null}
    </>
  );

  // The original recording: what it is, and how to replace, download or remove it; or how to get one.
  const recording = (
    <>
      {item.audioFile ? (
        <>
          <MaterialRow
            icon={<Headphones />}
            title={hasTab ? "Звук для табов" : "Запись"}
            sub={[
              item.audioFile.fromVideo ? "из видео" : item.audioFile.name,
              missing.audio ? "загрузи на этом устройстве" : hasTab ? (synced ? "синхронизирован" : "без синхронизации") : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              <>
                {audioData && (
                  <IconAction label="Скачать запись" onClick={() => downloadAudio(audioData, item.audioFile!.name)}>
                    <Download className="size-4" />
                  </IconAction>
                )}
                <FileAction label="Заменить запись" accept={AUDIO_ACCEPT} onFile={(f) => void uploadAudio(f)} />
                <IconAction label="Удалить запись" onClick={() => void removeAudio()}>
                  <Trash2 className="size-4" />
                </IconAction>
              </>
            }
          />
          <MatchWarnings warnings={item.audioWarnings} />
        </>
      ) : (
        <>
          {item.video && (
            <AddRow
              icon={<WandSparkles />}
              title={grabbing ? `Беру звук из видео…${grabAttempt > 1 ? ` (попытка ${grabAttempt})` : ""}` : "Звук из видео"}
              sub={hasTab ? "табы будут играть под запись из видео, а не синтезатор" : "запись можно будет замедлять без смены тона"}
              busy={grabbing}
              onClick={() => void grabAudio()}
            />
          )}
          <AddRow icon={<Headphones />} title="Своя запись" sub="mp3, m4a, wav" accept={AUDIO_ACCEPT} onFile={(f) => void uploadAudio(f)} />
        </>
      )}
    </>
  );

  // Sheet music from MuseScore, when the item links to it.
  const museRow = scoreLink && (
        <MaterialRow
          icon={<FileMusic />}
          title="Ноты с MuseScore"
          sub="XML — в табы, mp3 — как запись, PDF и MIDI — файлом"
          actions={
            <>
              {(["musicxml", "pdf", "midi", "mp3"] as const).map((f) => (
                <Button key={f} variant="ghost" size="sm" disabled={!!scoreBusy} onClick={() => void grabScore(f)} className="px-2 text-xs uppercase">
                  {scoreBusy === f ? <LoaderCircle className="size-4 animate-spin" /> : f === "musicxml" ? "xml" : f}
                </Button>
              ))}
            </>
          }
        />
      );

  const materials = (
    <div className="space-y-2">
      {/* Video */}
      {scoreOnly ? null : item.video && !editVideo ? (
        <MaterialRow
          icon={<Video />}
          title={`Видео ${videoSite(item.video)}`}
          sub={videoShortUrl(item.video)}
          actions={
            <>
              <IconAction label="Заменить видео" onClick={() => setEditVideo(true)}>
                <RefreshCw className="size-4" />
              </IconAction>
              <IconAction
                label="Удалить видео"
                onClick={() => {
                  if (item.video?.instagramId) void deleteInstagramVideo(item.id, item.video.instagramId);
                  updateItem(item.id, { video: undefined });
                }}
              >
                <Trash2 className="size-4" />
              </IconAction>
            </>
          }
        />
      ) : editVideo || empty ? (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              autoFocus={editVideo}
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveVideo()}
              inputMode="url"
              placeholder="Ссылка YouTube или Instagram"
              className="h-12 pl-10 text-sm"
            />
          </div>
          <Button variant="secondary" size="icon" aria-label="Сохранить видео" onClick={saveVideo} className="size-12">
            <Check />
          </Button>
        </div>
      ) : (
        <AddRow icon={<Video />} title="Добавить видео" sub="ссылка YouTube или Instagram" onClick={() => setEditVideo(true)} />
      )}

      {/* Tabs */}
      {item.tabFile ? (
        <MaterialRow
          icon={<FileMusic />}
          title="Табы"
          sub={missing.tab ? `${item.tabFile.name} · загрузи на этом устройстве` : `${item.tabFile.name}${sectionCount ? ` · разделов: ${sectionCount}` : ""}`}
          actions={
            <>
              <FileAction label="Заменить табы" accept={TAB_ACCEPT} onFile={(f) => void upload(f)} />
              <IconAction label="Удалить табы" onClick={() => void removeFile()}>
                <Trash2 className="size-4" />
              </IconAction>
            </>
          }
        />
      ) : (
        <AddRow icon={<FileMusic />} title="Добавить табы" sub="Guitar Pro или MusicXML" accept={TAB_ACCEPT} onFile={(f) => void upload(f)} />
      )}
      {findRow}

      {/* The neck: a scale or a chord shown on the fretboard */}
      {scoreOnly ? null : item.theory && !editBoard ? (
        <MaterialRow
          icon={<Grid3x3 />}
          title="Гриф"
          sub={theoryView(choiceOf(item.theory)).title}
          actions={
            <>
              <IconAction label="Изменить гриф" onClick={() => setEditBoard(true)}>
                <Pencil className="size-4" />
              </IconAction>
              <IconAction label="Убрать гриф" onClick={() => updateItem(item.id, { theory: undefined })}>
                <Trash2 className="size-4" />
              </IconAction>
            </>
          }
        />
      ) : editBoard ? (
        <div className="space-y-2 rounded-2xl bg-surface-2/50 p-3">
          <TheoryPicker value={item.theory ?? DEFAULT_BOARD} onChange={(theory) => updateItem(item.id, { theory })} />
          <Button variant="secondary" onClick={() => setEditBoard(false)} className="w-full">
            <Check /> Готово
          </Button>
        </div>
      ) : (
        <AddRow
          icon={<Grid3x3 />}
          title="Добавить гриф"
          sub="гамма, лад или аккорд по позициям"
          onClick={() => {
            updateItem(item.id, { theory: DEFAULT_BOARD });
            setEditBoard(true);
          }}
        />
      )}

      {recording}
      {museRow}
    </div>
  );

  if (part === "score") {
    const View = VIEW_META[tabView];
    const playBtn = hasTab && (
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
    );
    const viewBtn = hasTab && (
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
    );
    const player = hasTab && mediaReady && (
      <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl border border-line bg-surface" />}>
        <TabPlayer
          tex={file ? undefined : item.tab}
          file={file ?? undefined}
          audio={file && useRecording ? audioData : null}
          sync={item.audioSync}
          unrepeat={item.audioUnrepeat}
          bpm={file ? undefined : (item.startBpm ?? undefined)}
          playing={playing}
          track={track}
          countIn
          height="40vh"
          onScore={setScore}
        />
      </Suspense>
    );
    // Like "Заменить видео" under the video: one wide button under the tabs.
    const fileRow = item.tabFile ? (
      <label className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full cursor-pointer")}>
        <RefreshCw className="size-4" /> {missing.tab ? "Загрузить табы на этом устройстве" : "Заменить табы"}
        <input type="file" accept={TAB_ACCEPT} hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      </label>
    ) : (
      !item.tab && <AddRow icon={<FileMusic />} title="Загрузить табы или ноты" sub="Guitar Pro, MusicXML" accept={TAB_ACCEPT} onFile={(f) => void upload(f)} />
    );
    const trackSelect = score && score.tracks.length > 1 && (
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
    );
    const bound = !!item.audioFile;
    const audioRow = bound && (
      <div className="space-y-2">
        <MaterialRow
          icon={<Headphones />}
          title={item.audioFile!.fromVideo ? "Звук из видео" : item.audioFile!.name}
          sub={missing.audio ? "загрузи на этом устройстве" : hasTab ? (useRecording ? (synced ? "табы идут за записью" : "без синхронизации") : "сейчас играет синтезатор") : "запись"}
          actions={
            <>
              {/* On: the notes play with this sound; off: with the synthesizer. */}
              {file && audioData && (
                <Switch
                  aria-label="Играть ноты с этим звуком"
                  title={useRecording ? "Ноты играют с этим звуком" : "Ноты играют синтезатором"}
                  checked={useRecording}
                  onCheckedChange={(v) => {
                    setPlaying(false);
                    setUseRecording(v);
                  }}
                  className="mx-1"
                />
              )}
              {file && audioData && (
                <IconAction label="Поправить синхронизацию" active={showSync} onClick={() => setShowSync(!showSync)}>
                  <Link2 className="size-4" />
                </IconAction>
              )}
              <IconAction label="Отвязать аудио" onClick={() => void removeAudio()}>
                <Trash2 className="size-4" />
              </IconAction>
            </>
          }
        />
        <MatchWarnings warnings={item.audioWarnings} />
      </div>
    );
    // Two ways to bind the sound: from the item's video, or a file of one's own.
    const videoOk = !!item.video && audioReady;
    const videoHint = !item.video ? "сначала добавь блок «Видео»" : !audioReady ? "сервер звука не подключён" : "табы пойдут за записью из видео";
    const audioFileInput = (
      <input ref={audioInput} type="file" accept={AUDIO_ACCEPT} hidden onChange={(e) => e.target.files?.[0] && void uploadAudio(e.target.files[0])} />
    );
    const videoTitle = grabbing ? `Беру звук из видео…${grabAttempt > 1 ? ` (${grabAttempt})` : ""}` : "Из видео";
    // "Привязать аудио ▾" opens the two ways: the video's sound or a file of one's own.
    const bindMenu = !bound && (
      <div className="flex">
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <Button variant="dashed" size="sm" className="group h-10 active:scale-100">
              {grabbing ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />} {grabbing ? videoTitle : "Привязать аудио"}
              <ChevronDown className="size-4 text-muted transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-72 rounded-2xl border border-line bg-surface p-1.5 text-fg shadow-xl">
              <DropdownMenu.Item
                disabled={!videoOk}
                onSelect={() => void grabAudio()}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2"
              >
                <Video className="size-5 shrink-0 text-accent" />
                <span>
                  <span className="block text-sm font-semibold">Звук из видео</span>
                  <span className="block text-xs text-muted">{videoHint}</span>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => audioInput.current?.click()}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 outline-none data-[highlighted]:bg-surface-2"
              >
                <Headphones className="size-5 shrink-0 text-accent" />
                <span>
                  <span className="block text-sm font-semibold">Свой файл</span>
                  <span className="block text-xs text-muted">mp3, m4a, wav с устройства</span>
                </span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    );
    const strip = <SectionStrip item={item} />;

    // Controls sit on the tabs (top right); under them the sections, the file and the sound.
    return (
      <div className="space-y-3">
        {player && (
          <div className="relative">
            {player}
            {/* Clear of the tab's own scrollbar on the right. Each button is see-through (ON_TAB) so the notes show. */}
            <div className="absolute right-6 top-2 z-10 flex gap-1.5">
              {trackSelect}
              {viewBtn}
              {playBtn}
            </div>
          </div>
        )}
        {strip}
        {fileRow}
        {!item.tabFile && !item.tab && findRow}
        {audioFileInput}
        {audioRow || bindMenu}
        {museRow}
        {syncDialog}
      </div>
    );
  }

  return (
    <>
      <Card className="space-y-3 p-3">
        {empty ? (
          <>
            <div className="px-1 text-sm text-muted">
              {scoreOnly ? "Загрузи ноты (Guitar Pro, MusicXML) или запись — под них и будешь играть." : "Добавь видео, табы, запись или гриф — под них и будешь играть."}
            </div>
            {materials}
            <SectionStrip item={item} />
          </>
        ) : (
          <>
            {item.video && !scoreOnly && <VideoPlayer itemId={item.id} video={item.video} playing={false} />}
            {hasTab && mediaReady && (
              <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl border border-line bg-surface" />}>
                <TabPlayer
                  tex={file ? undefined : item.tab}
                  file={file ?? undefined}
                  audio={file && useRecording ? audioData : null}
                  sync={item.audioSync}
                  unrepeat={item.audioUnrepeat}
                  bpm={file ? undefined : (item.startBpm ?? undefined)}
                  playing={playing}
                  track={track}
                  countIn
                  height="40vh"
                  onScore={setScore}
                />
              </Suspense>
            )}
            {!hasTab && audioData && <AudioPreview data={audioData} />}
            {/* The song's sections live with its notes: a strip right under the player. */}
            <SectionStrip item={item} />
            {hasTab && <TabViewSwitch />}
            <div className="flex items-center gap-2">
              {hasTab ? (
                <Button
                  onClick={() => {
                    audio();
                    setPlaying(!playing);
                  }}
                  className="flex-1"
                >
                  {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                  {playing ? "Пауза" : file && audioData && useRecording ? "Играть с записью" : "Прослушать"}
                </Button>
              ) : (
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{badges}</div>
              )}
              <Button variant="secondary" size="icon" aria-label="Материалы" title="Материалы" onClick={() => setSheet(true)} className="size-12">
                <MoreHorizontal />
              </Button>
            </div>
            {hasTab && <div className="flex flex-wrap gap-1.5">{badges}</div>}
          </>
        )}
      </Card>

      <Drawer open={sheet} onOpenChange={setSheet}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Материалы</DrawerTitle>
          </DrawerHeader>
          <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
            {materials}

            {item.audioFile && audioData && file && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSheet(false);
                    setShowSync(true);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold transition-colors active:bg-surface-2"
                >
                  <Link2 className="size-[18px] text-muted" />
                  <span className="flex-1">Поправить синхронизацию</span>
                </button>
              </div>
            )}

            {hasTab && ((score && score.tracks.length > 1) || (file && audioData)) && (
              <div className="space-y-2">
                <div className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Воспроизведение</div>
                {file && audioData && (
                  <SourceSwitch
                    recording={useRecording}
                    onChange={(v) => {
                      setPlaying(false);
                      setUseRecording(v);
                    }}
                  />
                )}
                {score && score.tracks.length > 1 && (
                  <Select value={String(track)} onValueChange={(v) => setTrack(Number(v))}>
                    <SelectTrigger className="w-full" aria-label="Дорожка">
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
              </div>
            )}

            {score && score.sections.length > 0 && !noSections && (
              <Button variant="ghost" size="sm" onClick={sectionsFromFile} className="w-full">
                <ListTree className="size-4" /> Заново взять разделы из табов
              </Button>
            )}

            <p className="px-1 text-xs text-muted">Файлы табов и записей хранятся на этом устройстве.</p>
          </div>
        </DrawerContent>
      </Drawer>
      {syncDialog}
    </>
  );
}

function AudioPreview({ data }: { data: ArrayBuffer }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(audioBlob(data));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);
  return url ? <audio src={url} controls preload="metadata" className="w-full" /> : null;
}
