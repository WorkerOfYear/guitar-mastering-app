import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileMusic, Headphones, LoaderCircle, Plus, Upload, Video, X } from "lucide-react";
import { Button, Card, Chip, Input } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { TYPE_ICON } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { parseYouTube, AUDIO_ACCEPT, AUDIO_MAX, TAB_ACCEPT, TAB_MAX } from "./MediaCard";
import { saveAudioFile, saveTabFile } from "@/lib/tabFiles";
import { fileTitle, youtubeTitle } from "@/lib/titles";
import { serverReady } from "@/lib/youtubeAudio";
import { useSettings } from "@/store/settings";
import { useData } from "@/store/data";
import { TYPE_META, type ItemType } from "@/shared/types";

const TYPES: ItemType[] = ["technique", "song", "lick", "theory"];

export function NewItemPage() {
  const { addItem, updateItem } = useData();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ItemType>("technique");
  const [source, setSource] = useState<"video" | "audio">("video");
  const [videoUrl, setVideoUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [tabFile, setTabFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Once the user types a title, suggestions no longer overwrite it.
  const [titleTouched, setTitleTouched] = useState(false);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);

  const video = videoUrl.trim() ? parseYouTube(videoUrl) : null;
  const videoError = !!videoUrl.trim() && !video;
  const itemType = type;

  // No title typed: take the video's title, else the recording's or the tab's file name.
  useEffect(() => {
    setVideoTitle(null);
    if (!video || source !== "video") return;
    const ctl = new AbortController();
    void youtubeTitle(videoUrl.trim(), ctl.signal).then((t) => !ctl.signal.aborted && setVideoTitle(t));
    return () => ctl.abort();
  }, [video?.youtubeId, source]);
  const suggestion =
    (source === "video" && videoTitle) || (source === "audio" && audioFile && fileTitle(audioFile.name)) || (tabFile && fileTitle(tabFile.name)) || "";
  useEffect(() => {
    if (!titleTouched) setTitle(suggestion);
  }, [suggestion]);
  const finalTitle = title.trim() || suggestion;

  const create = async () => {
    if (!finalTitle || videoError) return;
    setBusy(true);
    try {
      const id = addItem({
        title: finalTitle,
        type: itemType,
        // No queue/active choice any more: what gets played is set in the plan builder.
        status: "active",
        links: video && source === "video" ? [videoUrl.trim()] : [],
        ...(itemType === "technique" || itemType === "lick" ? { startBpm: 60, targetBpm: 120, subdivision: 4 as const } : {}),
        ...(itemType === "song" ? { sections: [] } : {}),
        ...(video && source === "video" ? { video } : {}),
      });
      if (tabFile) {
        await saveTabFile(id, await tabFile.arrayBuffer());
        updateItem(id, { tabFile: { name: tabFile.name, size: tabFile.size } });
      }
      if (audioFile && source === "audio") {
        await saveAudioFile(id, await audioFile.arrayBuffer());
        updateItem(id, { audioFile: { name: audioFile.name, size: audioFile.size } });
      }
      // A video and our own audio server: the card takes the sound right away (and syncs it with the tab).
      const grabAudio = source === "video" && !!video && serverReady(useSettings.getState().audioServer);
      navigate(`/library/${id}`, { replace: true, state: { grabAudio } });
    } catch (e) {
      toast.error("Не удалось сохранить файл", { description: (e as Error).message });
      setBusy(false);
    }
  };

  const pick = (max: number, set: (f: File) => void, tooBig: string) => (f: File) => (f.size > max ? toast.error(tooBig) : set(f));

  return (
    <div className="space-y-3">
      <PageHeader title="Новый элемент" />
      <Card className="space-y-3">
        <Input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(!!e.target.value);
          }}
          placeholder={suggestion || "Название — или возьмётся из видео либо файла"}
        />
        <div className="grid grid-cols-4 gap-2">
          {TYPES.map((t) => {
            const Icon = TYPE_ICON[t];
            return (
              <Chip key={t} active={t === itemType} onClick={() => setType(t)} className="h-auto px-1 py-2.5">
                <span className="flex flex-col items-center gap-1 text-xs">
                  <Icon className="!size-5" />
                  {TYPE_META[t].title}
                </span>
              </Chip>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <div className="font-semibold">Под что играть</div>
          <div className="text-xs text-muted">Видео или запись, которая будет звучать на занятии</div>
        </div>
        <div role="radiogroup" aria-label="Под что играть" className="grid grid-cols-2 gap-2">
          <SourceTile active={source === "video"} onClick={() => setSource("video")} icon={<Video />} title="YouTube" sub="ссылка на видео" />
          <SourceTile active={source === "audio"} onClick={() => setSource("audio")} icon={<Headphones />} title="Аудиофайл" sub="mp3, m4a, wav" />
        </div>
        {source === "video" ? (
          <div className="space-y-1.5">
            <div className="relative">
              <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                inputMode="url"
                placeholder="Ссылка YouTube (можно с таймкодом)"
                className="pl-10 text-sm"
              />
            </div>
            {videoError && <p className="px-1 text-xs text-guide">Не похоже на ссылку YouTube</p>}
          </div>
        ) : (
          <FileField
            icon={<Headphones />}
            file={audioFile}
            accept={AUDIO_ACCEPT}
            onFile={pick(AUDIO_MAX, setAudioFile, "Аудио больше 40 МБ — сожми его в mp3")}
            onClear={() => setAudioFile(null)}
          >
            Выбрать запись (mp3, m4a, wav)
          </FileField>
        )}

        <div className="pt-2 font-semibold">Табы или ноты</div>
        <FileField
          icon={<FileMusic />}
          file={tabFile}
          accept={TAB_ACCEPT}
          onFile={pick(
            TAB_MAX,
            (f) => {
              setTabFile(f);
              setType("song"); // its markers become the sections
            },
            "Файл больше 5 МБ — это точно таб?",
          )}
          onClear={() => setTabFile(null)}
        >
          Guitar Pro или MusicXML (.gp, .gp5, .gpx, .musicxml, .mxl)
        </FileField>
      </Card>

      <Button size="lg" disabled={!finalTitle || videoError || busy} onClick={() => void create()} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Создать
      </Button>
    </div>
  );
}

/** One of the two play-along sources, picked like a radio button. */
function SourceTile({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => {
        haptic();
        onClick();
      }}
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition-[background-color,border-color,transform] active:scale-[0.98] [&_svg]:size-6",
        active ? "border-accent bg-accent/10 text-fg" : "border-line text-muted",
      )}
    >
      <span className={active ? "text-accent" : ""}>{icon}</span>
      <span className="text-sm font-semibold text-fg">{title}</span>
      <span className="text-[11px] leading-tight">{sub}</span>
    </button>
  );
}

/** A chosen file with a remove button, or a dashed button to choose one. */
function FileField({
  icon,
  file,
  accept,
  onFile,
  onClear,
  children,
}: {
  icon: ReactNode;
  file: File | null;
  accept: string;
  onFile: (f: File) => void;
  onClear: () => void;
  children: ReactNode;
}) {
  if (file)
    return (
      <div className="flex h-12 items-center gap-2 rounded-2xl bg-surface-2/60 pl-4 pr-1 text-sm [&_svg]:size-4">
        <span className="shrink-0 text-accent">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Убрать файл" onClick={onClear}>
          <X />
        </Button>
      </div>
    );
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-3 py-2 text-center text-sm font-semibold transition-colors hover:bg-surface-2 active:scale-[0.99]">
      <Upload className="size-4 shrink-0 text-muted" />
      <span>{children}</span>
      <input type="file" accept={accept} hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}
