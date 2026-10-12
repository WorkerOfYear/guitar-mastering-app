import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { FileMusic, Headphones, ListTree, Pause, Piano, Play, Plus, Trash2, Upload, Video } from "lucide-react";
import { Button, Card, Input, NumberField, Segmented } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YouTubePlayer } from "@/components/video/YouTubePlayer";
import type { ScoreInfo } from "@/components/tab/TabPlayer";
import { TabViewSwitch } from "@/components/tab/TabViewSwitch";
import { audio } from "@/audio/player";
import { deleteAudioFile, deleteTabFile, loadAudioFile, loadTabFile, saveAudioFile, saveTabFile } from "@/lib/tabFiles";
import { AudioSync } from "./AudioSync";
import { useData } from "@/store/data";
import type { Item, Section } from "@/shared/types";

const TabPlayer = lazy(() => import("@/components/tab/TabPlayer"));

/** "https://youtu.be/ID?t=73" / "watch?v=ID&t=1m13s" → { youtubeId, start } */
export function parseYouTube(url: string) {
  try {
    const u = new URL(url.trim());
    const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v");
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? "0";
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
    const start = m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
    return { youtubeId: id, start };
  } catch {
    return null;
  }
}

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

/** Dashed drop-zone-like button that opens a file picker. */
function FilePick({ children, accept, onFile }: { children: ReactNode; accept: string; onFile: (f: File) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-3 py-2 text-center text-sm font-semibold transition-colors hover:bg-surface-2 active:scale-[0.99]">
      <Upload className="size-4 shrink-0 text-muted" />
      <span>{children}</span>
      <input type="file" accept={accept} hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

/** Video, tab and Guitar Pro file of an item, with a preview player. */
export function MediaCard({ item }: { item: Item }) {
  const { updateItem } = useData();
  const [file, setFile] = useState<ArrayBuffer | null>(null);
  const [audioData, setAudioData] = useState<ArrayBuffer | null>(null);
  // The item says a file exists, but this device doesn't have it (another device, a restored backup).
  const [missing, setMissing] = useState({ tab: false, audio: false });
  const [useRecording, setUseRecording] = useState(true);
  const [score, setScore] = useState<ScoreInfo | null>(null);
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");

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

  const uploadAudio = async (f: File) => {
    setError("");
    if (f.size > AUDIO_MAX) return setError("Аудио больше 40 МБ — сожми его в mp3");
    const data = await f.arrayBuffer();
    await saveAudioFile(item.id, data);
    setAudioData(data);
    setMissing((m) => ({ ...m, audio: false }));
    setPlaying(false);
    updateItem(item.id, { audioFile: { name: f.name, size: f.size } });
  };
  const removeAudio = async () => {
    await deleteAudioFile(item.id);
    setAudioData(null);
    setPlaying(false);
    updateItem(item.id, { audioFile: undefined, audioSync: undefined });
  };

  const upload = async (f: File) => {
    setError("");
    if (f.size > TAB_MAX) return setError("Файл больше 5 МБ — это точно таб?");
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

  return (
    <Card className="space-y-3">
      {item.video && (
        <div className="space-y-2">
          <YouTubePlayer videoId={item.video.youtubeId} start={item.video.start} playing={false} />
          <Button variant="destructive-ghost" size="sm" onClick={() => updateItem(item.id, { video: undefined })} className="h-8 px-2 text-xs">
            <Trash2 className="size-3.5" /> Убрать видео
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            inputMode="url"
            placeholder={item.video ? "Другое видео: ссылка YouTube" : "Видео: ссылка YouTube (можно с таймкодом)"}
            className="h-11 pl-10 text-sm"
          />
        </div>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Добавить видео"
          onClick={() => {
            const v = parseYouTube(videoUrl);
            if (!v) return setError("Не похоже на ссылку YouTube");
            setError("");
            updateItem(item.id, { video: v, links: item.links.includes(videoUrl.trim()) ? item.links : [...item.links, videoUrl.trim()] });
            setVideoUrl("");
          }}
        >
          <Plus />
        </Button>
      </div>

      {(item.tab || file) && mediaReady && (
        <>
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
          <TabViewSwitch />
          {file && audioData && (
            <SourceSwitch
              recording={useRecording}
              onChange={(v) => {
                setPlaying(false);
                setUseRecording(v);
              }}
            />
          )}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                audio();
                setPlaying(!playing);
              }}
              className="flex-1"
            >
              {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
              {playing ? "Пауза" : "Прослушать"}
            </Button>
            {score && score.tracks.length > 1 && (
              <Select value={String(track)} onValueChange={(v) => setTrack(Number(v))}>
                <SelectTrigger className="max-w-[50%]" aria-label="Дорожка">
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
        </>
      )}

      {item.tabFile && !missing.tab ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <FileMusic className="size-4 shrink-0 text-accent" />
              <span className="truncate">{item.tabFile.name}</span>
            </span>
            <Button variant="destructive-ghost" size="sm" onClick={removeFile} className="h-8 px-2 text-xs">
              <Trash2 className="size-3.5" /> Удалить файл
            </Button>
          </div>
          {score && score.sections.length > 0 && !noSections && (
            <Button variant="ghost" size="sm" onClick={sectionsFromFile} className="w-full">
              <ListTree className="size-4" /> Заново взять разделы из меток файла
            </Button>
          )}
          {item.audioFile && audioData && file ? (
            <div className="space-y-2 rounded-2xl bg-surface-2/60 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Headphones className="size-4 shrink-0 text-accent" />
                  <span className="truncate">{item.audioFile.name}</span>
                </span>
                <Button variant="destructive-ghost" size="sm" onClick={removeAudio} className="h-8 px-2 text-xs">
                  <Trash2 className="size-3.5" /> Удалить запись
                </Button>
              </div>
              <AudioSync item={item} audio={audioData} tab={file!} sections={score?.sections ?? []} bars={score?.bars ?? 1} />
            </div>
          ) : (
            <FilePick accept={AUDIO_ACCEPT} onFile={(f) => void uploadAudio(f)}>
              {missing.audio
                ? `Загрузи «${item.audioFile?.name}» на этом устройстве (отметки сохранятся)`
                : "Загрузить запись, по которой написан таб (mp3, m4a, wav)"}
            </FilePick>
          )}
          <p className="text-xs text-muted">Файлы хранятся на этом устройстве. На другом устройстве их нужно загрузить ещё раз.</p>
        </div>
      ) : (
        <FilePick accept={TAB_ACCEPT} onFile={(f) => void upload(f)}>
          {missing.tab ? `Загрузи «${item.tabFile?.name}» на этом устройстве` : "Загрузить таб: Guitar Pro или MusicXML (.gp, .gp5, .gpx, .musicxml, .mxl)"}
        </FilePick>
      )}

      {/* A recording without a tab: just play along with it. */}
      {!item.tabFile &&
        (item.audioFile && audioData ? (
          <div className="space-y-2 rounded-2xl bg-surface-2/60 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Headphones className="size-4 shrink-0 text-accent" />
                <span className="truncate">{item.audioFile.name}</span>
              </span>
              <Button variant="destructive-ghost" size="sm" onClick={removeAudio} className="h-8 px-2 text-xs">
                <Trash2 className="size-3.5" /> Удалить запись
              </Button>
            </div>
            <AudioPreview data={audioData} />
          </div>
        ) : (
          <FilePick accept={AUDIO_ACCEPT} onFile={(f) => void uploadAudio(f)}>
            {missing.audio ? `Загрузи «${item.audioFile?.name}» на этом устройстве` : "Загрузить аудиозапись (mp3, m4a, wav)"}
          </FilePick>
        ))}

      <NumberField
        label="Длительность в занятии, мин (0 — поровну с остальными)"
        min={0}
        value={item.minutes ?? 0}
        onChange={(v) => updateItem(item.id, { minutes: v || undefined })}
      />
      {error && <p className="text-sm text-guide">{error}</p>}
    </Card>
  );
}

function AudioPreview({ data }: { data: ArrayBuffer }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([data]));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);
  return url ? <audio src={url} controls preload="metadata" className="w-full" /> : null;
}
