import { Suspense, lazy, useEffect, useState } from "react";
import { NumberField } from "@/components/metronome/MetronomePanel";
import { Card } from "@/components/ui";
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

/** 🎧 the original recording or 🎹 the synthesizer. */
export function SourceSwitch({ recording, onChange }: { recording: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex rounded-2xl bg-surface-2 p-1 text-xs font-medium">
      {[
        [true, "🎧 Запись"],
        [false, "🎹 Синтезатор"],
      ].map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v as boolean)}
          className={`flex-1 rounded-xl px-2 py-1.5 ${recording === v ? "bg-surface text-fg shadow-sm" : "text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
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

  const uploadAudio = async (f: File) => {
    setError("");
    if (f.size > 40_000_000) return setError("Аудио больше 40 МБ — сожми его в mp3");
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
    if (f.size > 5_000_000) return setError("Файл больше 5 МБ — это точно таб?");
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

  return (
    <Card className="space-y-3">
      {item.video && (
        <div className="space-y-2">
          <YouTubePlayer videoId={item.video.youtubeId} start={item.video.start} playing={false} />
          <button type="button" onClick={() => updateItem(item.id, { video: undefined })} className="text-xs text-guide">
            Убрать видео
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          inputMode="url"
          placeholder={item.video ? "Другое видео: ссылка YouTube" : "Видео: ссылка YouTube (можно с таймкодом)"}
          className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            const v = parseYouTube(videoUrl);
            if (!v) return setError("Не похоже на ссылку YouTube");
            setError("");
            updateItem(item.id, { video: v, links: item.links.includes(videoUrl.trim()) ? item.links : [...item.links, videoUrl.trim()] });
            setVideoUrl("");
          }}
          className="h-11 rounded-2xl bg-surface-2 px-4 font-semibold"
        >
          +
        </button>
      </div>

      {(item.tab || file) && (
        <>
          <Suspense fallback={<div className="h-72 rounded-3xl border border-line bg-surface" />}>
            <TabPlayer
              tex={file ? undefined : item.tab}
              file={file ?? undefined}
              audio={file && useRecording ? audioData : null}
              sync={item.audioSync}
              bpm={file ? undefined : (item.startBpm ?? undefined)}
              playing={playing}
              track={track}
              countIn
              height="40vh"
              onScore={setScore}
            />
          </Suspense>
          <TabViewSwitch />
          {file && audioData && <SourceSwitch recording={useRecording} onChange={(v) => { setPlaying(false); setUseRecording(v); }} />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                audio();
                setPlaying(!playing);
              }}
              className="h-12 flex-1 rounded-2xl bg-accent font-bold text-on-accent"
            >
              {playing ? "❚❚ Пауза" : "▶ Прослушать"}
            </button>
            {score && score.tracks.length > 1 && (
              <select value={track} onChange={(e) => setTrack(Number(e.target.value))} className="h-12 max-w-[50%] rounded-2xl border border-line bg-surface-2 px-3 text-sm">
                {score.tracks.map((t, i) => (
                  <option key={i} value={i}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        </>
      )}

      {item.tabFile && !missing.tab ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">📄 {item.tabFile.name}</span>
            <button type="button" onClick={removeFile} className="shrink-0 text-xs text-guide">
              Удалить файл
            </button>
          </div>
          {score && score.sections.length > 0 && (
            <button type="button" onClick={sectionsFromFile} className="h-11 w-full rounded-2xl bg-surface-2 text-sm font-semibold">
              Разделы из меток файла ({score.sections.map((s) => s.title).join(", ")})
            </button>
          )}
          {item.audioFile && audioData && file ? (
            <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">🎧 {item.audioFile.name}</span>
                <button type="button" onClick={removeAudio} className="shrink-0 text-xs text-guide">
                  Удалить запись
                </button>
              </div>
              <AudioSync item={item} audio={audioData} tab={file!} sections={score?.sections ?? []} bars={score?.bars ?? 1} />
            </div>
          ) : (
            <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line px-3 text-center text-sm font-semibold">
              {missing.audio ? `🎧 Загрузи «${item.audioFile?.name}» на этом устройстве (отметки сохранятся)` : "🎧 Загрузить запись, по которой написан таб (mp3, m4a, wav)"}
              <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" hidden onChange={(e) => e.target.files?.[0] && void uploadAudio(e.target.files[0])} />
            </label>
          )}
          <p className="text-xs text-muted">Файлы хранятся на этом устройстве. На другом устройстве их нужно загрузить ещё раз.</p>
        </div>
      ) : (
        <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line text-sm font-semibold">
          {missing.tab ? `📄 Загрузи «${item.tabFile?.name}» на этом устройстве` : "📄 Загрузить Guitar Pro файл (.gp, .gp5, .gpx…)"}
          <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.xml,.musicxml" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
      )}

      <NumberField label="Длительность в занятии, мин (0 — поровну с остальными)" min={0} value={item.minutes ?? 0} onChange={(v) => updateItem(item.id, { minutes: v || undefined })} />
      {error && <p className="text-sm text-guide">{error}</p>}
    </Card>
  );
}
