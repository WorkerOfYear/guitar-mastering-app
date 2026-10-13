import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Download,
  FileMusic,
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
  Video,
  WandSparkles,
} from "lucide-react";
import { Badge, Button, Card, Input, NumberField, Segmented } from "@/components/ui";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YouTubePlayer } from "@/components/video/YouTubePlayer";
import type { ScoreInfo } from "@/components/tab/TabPlayer";
import { TabViewSwitch } from "@/components/tab/TabViewSwitch";
import { audio } from "@/audio/player";
import { deleteAudioFile, deleteTabFile, loadAudioFile, loadTabFile, saveAudioFile, saveTabFile } from "@/lib/tabFiles";
import { audioBlob, downloadAudio } from "@/lib/audioType";
import { AudioSync, detectSync } from "./AudioSync";
import { fetchYoutubeAudio, serverReady } from "@/lib/youtubeAudio";
import { useSettings } from "@/store/settings";
import { useData } from "@/store/data";
import { cn } from "@/lib/utils";
import type { Item, Section } from "@/shared/types";

const TabPlayer = lazy(() => import("@/components/tab/TabPlayer"));

import { parseYouTube, withScheme } from "@/lib/youtubeLink";

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

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick}>
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

/** Video, tabs and recording of an item: the players up front, everything else in the "Материалы" sheet. */
export function MediaCard({ item }: { item: Item }) {
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

  /** A new recording: sync the tab to it right away when there is one. */
  const setRecording = async (data: ArrayBuffer, meta: NonNullable<Item["audioFile"]>) => {
    await saveAudioFile(item.id, data);
    setAudioData(data);
    setMissing((m) => ({ ...m, audio: false }));
    setPlaying(false);
    updateItem(item.id, { audioFile: meta, audioSync: undefined, audioUnrepeat: undefined });
    const tab = fileRef.current ?? (item.tabFile ? await loadTabFile(item.id) : null);
    if (!tab) return;
    const id = toast.loading("Связываю табы с записью…");
    try {
      const r = await detectSync(tab, data);
      updateItem(item.id, r.patch);
      (r.ok ? toast.success : toast.warning)(r.ok ? "Табы связаны с записью" : "Табы связаны, но не уверенно", { id, description: r.message });
    } catch (e) {
      toast.error("Не удалось связать табы с записью", { id, description: (e as Error).message });
    }
  };

  const uploadAudio = async (f: File) => {
    if (f.size > AUDIO_MAX) return toast.error("Аудио больше 40 МБ — сожми его в mp3");
    await setRecording(await f.arrayBuffer(), { name: f.name, size: f.size });
  };

  // The recording taken from the item's YouTube video by the user's server.
  const audioServer = useSettings((s) => s.audioServer);
  const [grabbing, setGrabbing] = useState(false);
  const [grabAttempt, setGrabAttempt] = useState(1);
  const grabAudio = async () => {
    if (!item.video) return;
    if (!serverReady(audioServer)) return toast.error("Укажи сервер для звука в настройках");
    setGrabbing(true);
    try {
      const { data, name } = await fetchYoutubeAudio(item.video.youtubeId, audioServer, setGrabAttempt);
      await setRecording(data, { name, size: data.byteLength, fromVideo: true });
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

  const removeAudio = async () => {
    await deleteAudioFile(item.id);
    setAudioData(null);
    setPlaying(false);
    updateItem(item.id, { audioFile: undefined, audioSync: undefined, audioUnrepeat: undefined });
  };

  const upload = async (f: File) => {
    if (f.size > TAB_MAX) return toast.error("Файл больше 5 МБ — это точно табы?");
    const data = await f.arrayBuffer();
    await saveTabFile(item.id, data);
    setFile(data);
    setMissing((m) => ({ ...m, tab: false }));
    setScore(null);
    updateItem(item.id, { tabFile: { name: f.name, size: f.size } });
  };

  const removeFile = async () => {
    await deleteTabFile(item.id);
    setFile(null);
    setScore(null);
    updateItem(item.id, { tabFile: undefined });
  };

  const [videoUrl, setVideoUrl] = useState("");
  const [editVideo, setEditVideo] = useState(false);
  const saveVideo = () => {
    const v = parseYouTube(videoUrl);
    if (!v) return toast.error("Не похоже на ссылку YouTube");
    const url = withScheme(videoUrl);
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
  const empty = !item.video && !item.tabFile && !item.tab && !item.audioFile;
  const [showSync, setShowSync] = useState(false);

  const badges = (
    <>
      {item.video && (
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

  const materials = (
    <div className="space-y-2">
      {/* Video */}
      {item.video && !editVideo ? (
        <MaterialRow
          icon={<Video />}
          title="Видео YouTube"
          sub={`youtu.be/${item.video.youtubeId}`}
          actions={
            <>
              <IconAction label="Заменить видео" onClick={() => setEditVideo(true)}>
                <RefreshCw className="size-4" />
              </IconAction>
              <IconAction label="Удалить видео" onClick={() => updateItem(item.id, { video: undefined })}>
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
              placeholder="Ссылка YouTube"
              className="h-12 pl-10 text-sm"
            />
          </div>
          <Button variant="secondary" size="icon" aria-label="Сохранить видео" onClick={saveVideo} className="size-12">
            <Check />
          </Button>
        </div>
      ) : (
        <AddRow icon={<Video />} title="Добавить видео" sub="ссылка YouTube" onClick={() => setEditVideo(true)} />
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

      {/* Recording */}
      {item.audioFile ? (
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
    </div>
  );

  return (
    <>
      <Card className="space-y-3 p-3">
        {empty ? (
          <>
            <div className="px-1 text-sm text-muted">Добавь видео, табы или запись — под них и будешь играть.</div>
            {materials}
          </>
        ) : (
          <>
            {item.video && <YouTubePlayer videoId={item.video.youtubeId} start={item.video.start} playing={false} />}
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
                  onClick={() => setShowSync(!showSync)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold transition-colors active:bg-surface-2"
                >
                  <Link2 className="size-[18px] text-muted" />
                  <span className="flex-1">Поправить синхронизацию</span>
                  <ChevronDown className={cn("size-4 text-muted transition-transform", showSync && "rotate-180")} />
                </button>
                {showSync && (
                  <div className="mt-1 rounded-2xl bg-surface-2/40 p-3">
                    <AudioSync item={item} audio={audioData} tab={file} sections={score?.sections ?? []} bars={score?.bars ?? 1} />
                  </div>
                )}
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

            <NumberField
              label="Длительность в занятии, мин (0 — поровну с остальными)"
              min={0}
              value={item.minutes ?? 0}
              onChange={(v) => updateItem(item.id, { minutes: v || undefined })}
            />
            <p className="px-1 text-xs text-muted">Файлы табов и записей хранятся на этом устройстве.</p>
          </div>
        </DrawerContent>
      </Drawer>
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
