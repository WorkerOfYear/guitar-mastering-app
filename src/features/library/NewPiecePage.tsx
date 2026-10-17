import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LoaderCircle, Plus } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";
import { BlockPicker, BlockShell, PIECE_BLOCKS } from "./blocks";
import { ScoreFields, VideoField } from "./newItemParts";
import { withScheme } from "@/lib/youtubeLink";
import { parseVideo } from "@/lib/videoLink";
import { saveTabFile } from "@/lib/tabFiles";
import { fileTitle, songQuery, youtubeTitle } from "@/lib/titles";
import { serverReady } from "@/lib/youtubeAudio";
import { useSettings } from "@/store/settings";
import { useData } from "@/store/data";
import type { BlockId } from "@/shared/types";

/** A piece (song), put together from blocks like an exercise: video, tabs and notes, own notes, takes. */
export function NewPiecePage() {
  const { items, addItem, updateItem } = useData();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<BlockId[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [tabFile, setTabFile] = useState<File | null>(null);
  // Tab and sheet-music links picked in the web search; they go into the item's links.
  const [tabLinks, setTabLinks] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const has = (b: BlockId) => blocks.includes(b);
  const video = has("video") && videoUrl.trim() ? parseVideo(videoUrl) : null;
  const videoError = has("video") && !!videoUrl.trim() && !video;

  useEffect(() => {
    setVideoTitle(null);
    // Instagram's oEmbed needs an app token, so only YouTube gives a title.
    if (!video?.youtubeId) return;
    const ctl = new AbortController();
    void youtubeTitle(withScheme(videoUrl), ctl.signal).then((t) => !ctl.signal.aborted && setVideoTitle(t));
    return () => ctl.abort();
  }, [video?.youtubeId]);

  // Left untitled: the video's title or the notes file's name, else "Произведение N".
  const suggestion =
    (video && videoTitle) ||
    (has("score") && tabFile && fileTitle(tabFile.name)) ||
    `Произведение ${items.filter((i) => i.type === "song").length + 1}`;
  const finalTitle = title.trim() || suggestion;
  // The video's title says who plays what; otherwise search by the title.
  const query = video && videoTitle ? songQuery(videoTitle) : finalTitle;

  const create = async () => {
    if (videoError) return;
    setBusy(true);
    try {
      // A video and our audio server: the card takes the sound from the video right away and binds it to the tabs
      // (a "Табы и ноты" block is added after the video if it isn't there).
      const grabAudio = !!video && serverReady(useSettings.getState().audioServer);
      const withAudio: BlockId[] = grabAudio && !has("score") ? blocks.flatMap((b) => (b === "video" ? ["video", "score"] : [b])) : blocks;
      const id = addItem({
        title: finalTitle,
        type: "song",
        // No queue/active choice any more: what gets played is set in the plan builder.
        status: "active",
        blocks: withAudio,
        sections: [],
        links: [...(video ? [withScheme(videoUrl)] : []), ...(has("score") ? tabLinks : [])],
        ...(video ? { video } : {}),
        ...(has("notes") ? { notes } : {}),
      });
      if (tabFile && has("score")) {
        await saveTabFile(id, await tabFile.arrayBuffer());
        updateItem(id, { tabFile: { name: tabFile.name, size: tabFile.size } });
      }
      navigate(`/library/${id}`, { replace: true, state: { grabAudio, fresh: true } });
    } catch (e) {
      toast.error("Не удалось сохранить файл", { description: (e as Error).message });
      setBusy(false);
    }
  };

  const body = (id: BlockId) => {
    switch (id) {
      case "video":
        return <VideoField value={videoUrl} onChange={setVideoUrl} error={videoError} />;
      case "score":
        return (
          <ScoreFields file={tabFile} onFile={setTabFile} links={tabLinks} onLinks={setTabLinks} query={query} auto={!!(video && videoTitle)} initialMode="search" />
        );
      case "notes":
        return <Textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Мысли по поводу произведения" />;
      case "recorder":
        return <p className="text-sm text-muted">Кнопка «Записать игру» появится на занятии и в карточке — записи можно будет послушать потом.</p>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Новое произведение" />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestion} aria-label="Название" />
      {blocks.map((id) => (
        <BlockShell key={id} id={id} onRemove={() => setBlocks((b) => b.filter((x) => x !== id))}>
          {body(id)}
        </BlockShell>
      ))}
      {!blocks.length && <p className="px-1 text-sm text-muted">Собери произведение из блоков — добавь то, что нужно:</p>}
      <BlockPicker from={PIECE_BLOCKS} have={blocks} onAdd={(id) => setBlocks((b) => [...b, id])} />
      <Button size="lg" disabled={videoError || busy} onClick={() => void create()} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Создать
      </Button>
    </div>
  );
}
