import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileMusic, Headphones, LoaderCircle, Plus, Upload, Video, X } from "lucide-react";
import { Button, Card, Chip, Input, Segmented } from "@/components/ui";
import { TYPE_ICON } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { parseYouTube, AUDIO_ACCEPT, AUDIO_MAX, TAB_ACCEPT, TAB_MAX } from "./MediaCard";
import { saveAudioFile, saveTabFile } from "@/lib/tabFiles";
import { useData } from "@/store/data";
import { TYPE_META, type ItemStatus, type ItemType } from "@/shared/types";

const TYPES: ItemType[] = ["technique", "song", "lick", "theory"];

export function NewItemPage() {
  const { addItem, updateItem } = useData();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ItemType>("technique");
  const [status, setStatus] = useState<ItemStatus>("queue");
  const [source, setSource] = useState<"video" | "audio">("video");
  const [videoUrl, setVideoUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [tabFile, setTabFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const video = videoUrl.trim() ? parseYouTube(videoUrl) : null;
  const videoError = !!videoUrl.trim() && !video;
  const itemType = type;

  const create = async () => {
    if (!title.trim() || videoError) return;
    setBusy(true);
    try {
      const id = addItem({
        title: title.trim(),
        type: itemType,
        status,
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
      navigate(`/library/${id}`, { replace: true });
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
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название, например «Лик из соло Mr. Big»" />
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
        <div className="text-sm font-semibold">Что играть вместе</div>
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            {
              value: "video",
              label: (
                <>
                  <Video /> Видео YouTube
                </>
              ),
            },
            {
              value: "audio",
              label: (
                <>
                  <Headphones /> Аудиофайл
                </>
              ),
            },
          ]}
        />
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

        <div className="pt-1 text-sm font-semibold">Таб или ноты, если есть</div>
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
        {tabFile && <p className="px-1 text-xs text-muted">Разделы песни возьмутся из меток файла — их можно будет переименовать или удалить.</p>}
      </Card>

      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { value: "queue", label: "В очередь" },
          { value: "active", label: "Сразу в работу" },
        ]}
      />
      <Button size="lg" disabled={!title.trim() || videoError || busy} onClick={() => void create()} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Создать
      </Button>
    </div>
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
