import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Headphones, LoaderCircle, Plus, Video } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";
import { AUDIO_ACCEPT, AUDIO_MAX } from "./MediaCard";
import { FileField, ScoreFields, SourceTile, VideoField, pickFile } from "./newItemParts";
import { parseYouTube, withScheme } from "@/lib/youtubeLink";
import { saveAudioFile, saveTabFile } from "@/lib/tabFiles";
import { fileTitle, songQuery, youtubeTitle } from "@/lib/titles";
import { serverReady } from "@/lib/youtubeAudio";
import { useSettings } from "@/store/settings";
import { useData } from "@/store/data";

/** A piece (song): what to play along with — a video or a recording — and its tab or sheet music. */
export function NewPiecePage() {
  const { addItem, updateItem } = useData();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"video" | "audio">("video");
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
  const usesVideo = source === "video";

  // No title typed: take the video's title, else the recording's or the tab's file name.
  useEffect(() => {
    setVideoTitle(null);
    if (!video || !usesVideo) return;
    const ctl = new AbortController();
    void youtubeTitle(withScheme(videoUrl), ctl.signal).then((t) => !ctl.signal.aborted && setVideoTitle(t));
    return () => ctl.abort();
  }, [video?.youtubeId, usesVideo]);
  const suggestion = (usesVideo && videoTitle) || (!usesVideo && audioFile && fileTitle(audioFile.name)) || (tabFile && fileTitle(tabFile.name)) || "";
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
        type: "song",
        // No queue/active choice any more: what gets played is set in the plan builder.
        status: "active",
        links: [...(video && usesVideo ? [withScheme(videoUrl)] : []), ...tabLinks],
        sections: [],
        ...(video && usesVideo ? { video } : {}),
      });
      if (tabFile) {
        await saveTabFile(id, await tabFile.arrayBuffer());
        updateItem(id, { tabFile: { name: tabFile.name, size: tabFile.size } });
      }
      if (audioFile && !usesVideo) {
        await saveAudioFile(id, await audioFile.arrayBuffer());
        updateItem(id, { audioFile: { name: audioFile.name, size: audioFile.size } });
      }
      // A video and our own audio server: the card takes the sound right away (and syncs it with the tab).
      const grabAudio = usesVideo && !!video && serverReady(useSettings.getState().audioServer);
      navigate(`/library/${id}`, { replace: true, state: { grabAudio } });
    } catch (e) {
      toast.error("Не удалось сохранить файл", { description: (e as Error).message });
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Новое произведение" />
      <Card>
        <Input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(!!e.target.value);
          }}
          placeholder={suggestion || "Название — или возьмётся из видео либо файла"}
        />
      </Card>

      <Card className="space-y-3">
        <div>
          <div className="font-semibold">Под что играть</div>
          <div className="text-xs text-muted">Видео или запись, которая будет звучать на занятии</div>
        </div>
        <div role="radiogroup" aria-label="Под что играть" className="grid grid-cols-2 gap-2">
          <SourceTile active={usesVideo} onClick={() => setSource("video")} icon={<Video />} title="YouTube" sub="ссылка на видео" />
          <SourceTile active={!usesVideo} onClick={() => setSource("audio")} icon={<Headphones />} title="Аудиофайл" sub="mp3, m4a, wav" />
        </div>
        {usesVideo ? (
          <VideoField value={videoUrl} onChange={setVideoUrl} error={videoError} />
        ) : (
          <FileField
            icon={<Headphones />}
            file={audioFile}
            accept={AUDIO_ACCEPT}
            onFile={pickFile(AUDIO_MAX, setAudioFile, "Аудио больше 40 МБ — сожми его в mp3")}
            onClear={() => setAudioFile(null)}
          >
            Выбрать запись (mp3, m4a, wav)
          </FileField>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <div className="font-semibold">Ноты</div>
          <div className="text-xs text-muted">Свой файл или ссылки с сайтов табов</div>
        </div>
        <ScoreFields
          file={tabFile}
          onFile={setTabFile}
          links={tabLinks}
          onLinks={setTabLinks}
          query={videoQuery || finalTitle}
          auto={!!videoQuery}
          initialMode="search"
        />
      </Card>

      <Button size="lg" disabled={!finalTitle || (usesVideo && videoError) || busy} onClick={() => void create()} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Создать
      </Button>
    </div>
  );
}
