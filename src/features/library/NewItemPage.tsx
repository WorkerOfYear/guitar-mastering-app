import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FileMusic, Globe, Grid3x3, Headphones, LoaderCircle, NotebookPen, Plus, Upload, Video, X } from "lucide-react";
import { Button, Card, Chip, Input, Segmented, Textarea } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { TYPE_ICON } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/Placeholder";
import { AUDIO_ACCEPT, AUDIO_MAX, TAB_ACCEPT, TAB_MAX } from "./MediaCard";
import { parseYouTube, withScheme } from "@/lib/youtubeLink";
import { saveAudioFile, saveTabFile } from "@/lib/tabFiles";
import { fileTitle, songQuery, youtubeTitle } from "@/lib/titles";
import { TabSearch } from "./TabSearch";
import { DEFAULT_BOARD, TheoryPicker } from "@/components/fretboard/TheoryPicker";
import { serverReady } from "@/lib/youtubeAudio";
import { useSettings } from "@/store/settings";
import { useData } from "@/store/data";
import { TYPE_META, type ItemType, type TheoryLink } from "@/shared/types";

const EXERCISE_TYPES: ItemType[] = ["technique", "lick", "theory"];

/** What a new exercise starts from; the rest can be added later on its card. */
type Start = "video" | "notes" | "board" | "text";

export function NewItemPage() {
  const { addItem, updateItem } = useData();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [params] = useSearchParams();
  // Pieces (songs) and exercises are added differently: a piece needs its recording and tab up front,
  // an exercise starts from one thing (video, tab, the neck or just a description).
  const [kind, setKind] = useState<"exercise" | "piece">(params.get("type") === "song" ? "piece" : "exercise");
  const [type, setType] = useState<ItemType>(EXERCISE_TYPES.find((t) => t === params.get("type")) ?? "technique");
  const [start, setStart] = useState<Start>("text");
  const [description, setDescription] = useState("");
  const [board, setBoard] = useState<TheoryLink>(DEFAULT_BOARD);
  const [source, setSource] = useState<"video" | "audio">("video");
  // A piece's tab is usually found online; an exercise's is more often one's own file.
  const [tabMode, setTabMode] = useState<"file" | "search">(kind === "piece" ? "search" : "file");
  const [videoUrl, setVideoUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [tabFile, setTabFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Once the user types a title, suggestions no longer overwrite it.
  const [titleTouched, setTitleTouched] = useState(false);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  // Tab and sheet-music links picked in the web search; they go into the item's links.
  const [tabLinks, setTabLinks] = useState<string[]>([]);

  const video = videoUrl.trim() ? parseYouTube(videoUrl) : null;
  const videoError = !!videoUrl.trim() && !video;
  const piece = kind === "piece";
  const itemType: ItemType = piece ? "song" : type;
  const usesVideo = piece ? source === "video" : start === "video";
  const usesAudio = piece && source === "audio";
  const usesTab = piece || start === "notes";

  // No title typed: take the video's title, else the recording's or the tab's file name.
  useEffect(() => {
    setVideoTitle(null);
    if (!video || !usesVideo) return;
    const ctl = new AbortController();
    void youtubeTitle(withScheme(videoUrl), ctl.signal).then((t) => !ctl.signal.aborted && setVideoTitle(t));
    return () => ctl.abort();
  }, [video?.youtubeId, usesVideo]);
  const suggestion =
    (usesVideo && videoTitle) || (usesAudio && audioFile && fileTitle(audioFile.name)) || (usesTab && tabFile && fileTitle(tabFile.name)) || "";
  useEffect(() => {
    if (!titleTouched) setTitle(suggestion);
  }, [suggestion]);
  const finalTitle = title.trim() || suggestion;
  // The video's title says who plays what; otherwise search by the title typed for the item.
  const videoQuery = usesVideo && videoTitle ? songQuery(videoTitle) : "";

  const create = async () => {
    if (!finalTitle || (usesVideo && videoError)) return;
    setBusy(true);
    try {
      const id = addItem({
        title: finalTitle,
        type: itemType,
        // No queue/active choice any more: what gets played is set in the plan builder.
        status: "active",
        links: [...(video && usesVideo ? [withScheme(videoUrl)] : []), ...(usesTab ? tabLinks : [])],
        ...(itemType === "technique" || itemType === "lick" ? { startBpm: 60, targetBpm: 120, subdivision: 4 as const } : {}),
        ...(itemType === "song" ? { sections: [] } : {}),
        ...(video && usesVideo ? { video } : {}),
        ...(!piece && description.trim() ? { description: description.trim() } : {}),
        ...(!piece && start === "board" ? { theory: board } : {}),
      });
      if (tabFile && usesTab) {
        await saveTabFile(id, await tabFile.arrayBuffer());
        updateItem(id, { tabFile: { name: tabFile.name, size: tabFile.size } });
      }
      if (audioFile && usesAudio) {
        await saveAudioFile(id, await audioFile.arrayBuffer());
        updateItem(id, { audioFile: { name: audioFile.name, size: audioFile.size } });
      }
      // A video and our own audio server: the card takes the sound right away (and syncs it with the tab).
      // Only for pieces: an exercise's video just plays as it is.
      const grabAudio = piece && usesVideo && !!video && serverReady(useSettings.getState().audioServer);
      navigate(`/library/${id}`, { replace: true, state: { grabAudio } });
    } catch (e) {
      toast.error("Не удалось сохранить файл", { description: (e as Error).message });
      setBusy(false);
    }
  };

  const pick = (max: number, set: (f: File) => void, tooBig: string) => (f: File) => (f.size > max ? toast.error(tooBig) : set(f));

  const videoField = (
    <div className="space-y-1.5">
      <div className="relative">
        <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} inputMode="url" placeholder="Ссылка YouTube (можно с таймкодом)" className="pl-10 text-sm" />
      </div>
      {videoError && <p className="px-1 text-xs text-guide">Не похоже на ссылку YouTube</p>}
    </div>
  );

  const tabFields = (
    <>
      <div role="radiogroup" aria-label="Табы или ноты" className="grid grid-cols-2 gap-2">
        <SourceTile active={tabMode === "file"} onClick={() => setTabMode("file")} icon={<Upload />} title="Загрузить" sub="Guitar Pro, MusicXML" />
        <SourceTile active={tabMode === "search"} onClick={() => setTabMode("search")} icon={<Globe />} title="Найти в интернете" sub="Songsterr, UG, MuseScore" />
      </div>
      {/* Both stay mounted: switching back keeps the found results and the chosen file. */}
      <div hidden={tabMode !== "file"}>
        <FileField icon={<FileMusic />} file={tabFile} accept={TAB_ACCEPT} onFile={pick(TAB_MAX, setTabFile, "Файл больше 5 МБ — это точно таб?")} onClear={() => setTabFile(null)}>
          Выбрать файл (.gp, .gp5, .gpx, .musicxml, .mxl)
        </FileField>
      </div>
      <div hidden={tabMode !== "search"}>
        <TabSearch
          query={videoQuery || finalTitle}
          auto={!!videoQuery}
          picked={tabLinks}
          onToggle={(url) => setTabLinks((l) => (l.includes(url) ? l.filter((u) => u !== url) : [...l, url]))}
        />
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      <PageHeader title={piece ? "Новое произведение" : "Новое упражнение"} />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "exercise", label: "Упражнение" },
          { value: "piece", label: "Произведение" },
        ]}
      />
      <Card className="space-y-3">
        <Input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(!!e.target.value);
          }}
          placeholder={suggestion || (piece ? "Название — или возьмётся из видео либо файла" : "Название упражнения")}
        />
        {!piece && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {EXERCISE_TYPES.map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <Chip key={t} active={t === type} onClick={() => setType(t)} className="h-auto px-1 py-2.5">
                    <span className="flex flex-col items-center gap-1 text-xs">
                      <Icon className="!size-5" />
                      {TYPE_META[t].title}
                    </span>
                  </Chip>
                );
              })}
            </div>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Что и как играть" />
          </>
        )}
      </Card>

      {piece ? (
        <>
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
              videoField
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
          </Card>
          <Card className="space-y-3">
            <div>
              <div className="font-semibold">Табы или ноты</div>
              <div className="text-xs text-muted">Свой файл или ссылки с сайтов табов</div>
            </div>
            {tabFields}
          </Card>
        </>
      ) : (
        <Card className="space-y-3">
          <div>
            <div className="font-semibold">С чего начать</div>
            <div className="text-xs text-muted">Остальное можно добавить потом в карточке упражнения</div>
          </div>
          <div role="radiogroup" aria-label="С чего начать" className="grid grid-cols-2 gap-2">
            <SourceTile active={start === "video"} onClick={() => setStart("video")} icon={<Video />} title="Видео" sub="играть вместе с YouTube" />
            <SourceTile active={start === "notes"} onClick={() => setStart("notes")} icon={<FileMusic />} title="Таб" sub="Guitar Pro, MusicXML" />
            <SourceTile active={start === "board"} onClick={() => setStart("board")} icon={<Grid3x3 />} title="Гриф" sub="гамма, лад или аккорд" />
            <SourceTile active={start === "text"} onClick={() => setStart("text")} icon={<NotebookPen />} title="Только описание" sub="под метроном" />
          </div>
          {start === "video" && videoField}
          {start === "notes" && tabFields}
          {start === "board" && <TheoryPicker value={board} onChange={setBoard} />}
        </Card>
      )}

      <Button size="lg" disabled={!finalTitle || (usesVideo && videoError) || busy} onClick={() => void create()} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Создать
      </Button>
    </div>
  );
}

/** One of two options (play-along source, where the tab comes from), picked like a radio button. */
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
