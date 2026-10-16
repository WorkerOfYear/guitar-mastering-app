import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LoaderCircle, Plus } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";
import { DEFAULT_BOARD, TheoryPicker } from "@/components/fretboard/TheoryPicker";
import { BlockPicker, BlockShell } from "./blocks";
import { MetronomeBlock } from "./ExerciseBlocks";
import { ScoreFields, VideoField } from "./newItemParts";
import { defaultExerciseTitle } from "@/lib/library";
import { parseYouTube, withScheme } from "@/lib/youtubeLink";
import { saveTabFile } from "@/lib/tabFiles";
import { fileTitle, youtubeTitle } from "@/lib/titles";
import { choiceOf, theoryView } from "@/music/theoryView";
import { useData } from "@/store/data";
import type { BlockId, Item, TheoryLink } from "@/shared/types";

/** An exercise is put together from blocks; each one is set up right here, or later on its card. */
export function NewExercisePage() {
  const { items, addItem, updateItem } = useData();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<BlockId[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [tabFile, setTabFile] = useState<File | null>(null);
  const [tabLinks, setTabLinks] = useState<string[]>([]);
  const [board, setBoard] = useState<TheoryLink>(DEFAULT_BOARD);
  const [tempo, setTempo] = useState<{ startBpm: number | null; targetBpm: number | null }>({
    startBpm: 60,
    targetBpm: 120,
  });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const has = (b: BlockId) => blocks.includes(b);
  const video = has("video") && videoUrl.trim() ? parseYouTube(videoUrl) : null;
  const videoError = has("video") && !!videoUrl.trim() && !video;

  useEffect(() => {
    setVideoTitle(null);
    if (!video) return;
    const ctl = new AbortController();
    void youtubeTitle(withScheme(videoUrl), ctl.signal).then((t) => !ctl.signal.aborted && setVideoTitle(t));
    return () => ctl.abort();
  }, [video?.youtubeId]);

  // Left untitled: the video's title, the notes file's name, the scale or chord on the neck, else "Упражнение N".
  const suggestion =
    (video && videoTitle) ||
    (has("score") && tabFile && fileTitle(tabFile.name)) ||
    (has("board") && theoryView(choiceOf(board)).title) ||
    defaultExerciseTitle(items);
  const finalTitle = title.trim() || suggestion;

  const create = async () => {
    if (videoError) return;
    setBusy(true);
    try {
      const fields: Partial<Item> = {
        ...(video ? { video } : {}),
        ...(has("board") ? { theory: board } : {}),
        ...(has("metronome") ? tempo : {}),
        ...(has("notes") ? { notes } : {}),
      };
      const id = addItem({
        title: finalTitle,
        // Exercises no longer have kinds (technique, lick, theory); new ones are all "technique".
        type: "technique",
        status: "active",
        blocks,
        links: [...(video ? [withScheme(videoUrl)] : []), ...(has("score") ? tabLinks : [])],
        ...fields,
      });
      if (tabFile && has("score")) {
        await saveTabFile(id, await tabFile.arrayBuffer());
        updateItem(id, { tabFile: { name: tabFile.name, size: tabFile.size } });
      }
      navigate(`/library/${id}`, { replace: true });
    } catch (e) {
      toast.error("Не удалось сохранить файл", { description: (e as Error).message });
      setBusy(false);
    }
  };

  const body = (id: BlockId) => {
    switch (id) {
      case "video":
        return (
          <div>
            <VideoField value={videoUrl} onChange={setVideoUrl} error={videoError} />
          </div>
        );
      case "score":
        return (
          <div className="space-y-3">
            <ScoreFields file={tabFile} onFile={setTabFile} links={tabLinks} onLinks={setTabLinks} query={finalTitle} auto={false} />
          </div>
        );
      case "board":
        return (
          <div>
            <TheoryPicker value={board} onChange={setBoard} />
          </div>
        );
      case "metronome":
        return <MetronomeBlock item={tempo} update={(p) => setTempo((t) => ({ ...t, ...p }))} />;
      case "notes":
        return (
          <div>
            <Textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Мысли по поводу упражнения" />
          </div>
        );
      case "recorder":
        return <p className="text-sm text-muted">Кнопка «Записать игру» появится на занятии и в карточке упражнения — записи можно будет послушать потом.</p>;
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Новое упражнение" />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestion} aria-label="Название" />
      {blocks.map((id) => (
        <BlockShell key={id} id={id} onRemove={() => setBlocks((b) => b.filter((x) => x !== id))}>
          {body(id)}
        </BlockShell>
      ))}
      {!blocks.length && <p className="px-1 text-sm text-muted">Собери упражнение из блоков — добавь то, что нужно:</p>}
      <BlockPicker have={blocks} onAdd={(id) => setBlocks((b) => [...b, id])} />
      <Button size="lg" disabled={videoError || busy} onClick={() => void create()} className="w-full">
        {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Создать
      </Button>
    </div>
  );
}
