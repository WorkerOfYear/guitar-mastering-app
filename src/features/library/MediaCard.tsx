import { Suspense, lazy, useEffect, useState } from "react";
import { NumberField } from "@/components/metronome/MetronomePanel";
import { Card } from "@/components/ui";
import { YouTubePlayer } from "@/components/video/YouTubePlayer";
import type { ScoreInfo } from "@/components/tab/TabPlayer";
import { audio } from "@/audio/player";
import { deleteTabFile, loadTabFile, saveTabFile } from "@/lib/tabFiles";
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

/** Video, tab and Guitar Pro file of an item, with a preview player. */
export function MediaCard({ item }: { item: Item }) {
  const { updateItem } = useData();
  const [file, setFile] = useState<ArrayBuffer | null>(null);
  const [score, setScore] = useState<ScoreInfo | null>(null);
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (item.tabFile) void loadTabFile(item.id).then((f) => setFile(f ?? null));
  }, [item.id, item.tabFile]);

  const upload = async (f: File) => {
    setError("");
    if (f.size > 5_000_000) return setError("Файл больше 5 МБ — это точно таб?");
    const data = await f.arrayBuffer();
    await saveTabFile(item.id, data);
    setFile(data);
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
              bpm={file ? undefined : (item.startBpm ?? undefined)}
              playing={playing}
              track={track}
              countIn
              height="40vh"
              onScore={setScore}
            />
          </Suspense>
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

      {item.tabFile ? (
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
          <p className="text-xs text-muted">Файл хранится на этом устройстве. На другом устройстве его нужно загрузить ещё раз.</p>
        </div>
      ) : (
        <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line text-sm font-semibold">
          📄 Загрузить Guitar Pro файл (.gp, .gp5, .gpx…)
          <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.xml,.musicxml" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
      )}

      <NumberField label="Длительность в занятии, мин (0 — поровну с остальными)" min={0} value={item.minutes ?? 0} onChange={(v) => updateItem(item.id, { minutes: v || undefined })} />
      {error && <p className="text-sm text-guide">{error}</p>}
    </Card>
  );
}
