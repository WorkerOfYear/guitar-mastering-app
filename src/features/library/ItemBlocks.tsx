import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Check, Pencil, RefreshCw, Video } from "lucide-react";
import { Button, Input, NumberField, SectionTitle, Textarea } from "@/components/ui";
import { ItemBoard } from "@/components/fretboard/ItemBoard";
import { DEFAULT_BOARD, TheoryPicker } from "@/components/fretboard/TheoryPicker";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { addBlockPatch, blocksOf, isExercise, removeBlockPatch } from "@/lib/library";
import { choiceOf, theoryView } from "@/music/theoryView";
import { withScheme } from "@/lib/youtubeLink";
import { parseVideo, videoSite } from "@/lib/videoLink";
import { deleteInstagramVideo } from "@/lib/tabFiles";
import { useData } from "@/store/data";
import type { BlockId, Item } from "@/shared/types";
import { BlockPicker, BlockShell, EXERCISE_BLOCKS, PIECE_BLOCKS } from "./blocks";
import { MediaCard } from "./MediaCard";
import { TakesList } from "./Takes";

/**
 * The card body of an exercise or a piece: its blocks in order, folded, then chips to add more.
 * A block just added opens; right after the item is created they all start open, so whatever runs inside
 * them (taking the sound from the video, sections from the notes file) gets going.
 */
export function ItemBlocks({ item }: { item: Item }) {
  const { updateItem } = useData();
  const update = (patch: Partial<Item>) => updateItem(item.id, patch);
  const blocks = blocksOf(item);
  const piece = !isExercise(item);
  const fresh = !!(useLocation().state as { fresh?: boolean } | null)?.fresh;
  const [open, setOpen] = useState<BlockId[]>(() => (fresh ? blocks : []));
  const toggle = (id: BlockId) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <section>
      <SectionTitle>Из чего состоит</SectionTitle>
      <div className="space-y-2">
        {blocks.map((id) => (
          <BlockShell
            key={id}
            id={id}
            open={open.includes(id)}
            onToggle={() => toggle(id)}
            summary={blockSummary(id, item)}
            onRemove={() => update(removeBlockPatch(item, id))}
          >
            <BlockBody id={id} item={item} update={update} />
          </BlockShell>
        ))}
        {!blocks.length && (
          <p className="px-1 text-sm text-muted">
            {piece ? "Собери произведение из блоков: видео, запись, ноты и другие." : "Собери упражнение из блоков: видео, ноты, гриф, метроном и другие."}
          </p>
        )}
      </div>
      <div className="pt-3">
        <BlockPicker
          from={piece ? PIECE_BLOCKS : EXERCISE_BLOCKS}
          have={blocks}
          onAdd={(id) => {
            update(addBlockPatch(item, id));
            setOpen((o) => [...o, id]);
          }}
        />
      </div>
    </section>
  );
}

/** What a folded block holds, in a few words. */
function blockSummary(id: BlockId, item: Item): string {
  switch (id) {
    case "video":
      return item.video ? `${videoSite(item.video)}${item.video.start ? ` с ${Math.floor(item.video.start / 60)}:${String(Math.floor(item.video.start % 60)).padStart(2, "0")}` : ""}` : "ссылка не добавлена";
    case "audio":
      return item.audioFile?.name ?? "файл не загружен";
    case "score":
      return item.tabFile?.name ?? (item.tab ? "табы упражнения" : (item.audioFile?.name ?? "файл не загружен"));
    case "board":
      return item.theory ? theoryView(choiceOf(item.theory)).title : "гамма не выбрана";
    case "metronome":
      return `${item.startBpm ?? "—"} → ${item.targetBpm ?? "—"} bpm`;
    case "notes":
      return (item.notes ?? item.description ?? "").trim().split("\n")[0] || "пока пусто";
    case "recorder":
      return "записи твоей игры";
  }
}

function BlockBody({ id, item, update }: { id: BlockId; item: Item; update: (patch: Partial<Item>) => void }) {
  switch (id) {
    case "video":
      return <VideoBlock item={item} update={update} />;
    case "score":
      // The recording is bound to the tabs here (for pieces and exercises alike).
      return <MediaCard item={item} part="score" />;
    case "board":
      return <BoardBlock item={item} update={update} />;
    case "metronome":
      return <MetronomeBlock item={item} update={update} />;
    case "notes":
      return (
        <div>
          <Textarea
            value={item.notes ?? item.description ?? ""}
            onChange={(e) => update({ notes: e.target.value, description: undefined })}
            rows={4}
            placeholder="Что получается, где ошибаюсь, на что обратить внимание"
          />
        </div>
      );
    case "recorder":
      return (
        <div>
          <TakesList itemId={item.id} />
        </div>
      );
  }
}

/** The video, or a field for its link until there is one. */
export function VideoBlock({ item, update }: { item: Item; update: (patch: Partial<Item>) => void }) {
  const [url, setUrl] = useState("");
  const [edit, setEdit] = useState(false);
  const parsed = url.trim() ? parseVideo(url) : null;
  const save = () => {
    if (!parsed) return;
    const link = withScheme(url);
    if (item.video?.instagramId && item.video.instagramId !== parsed.instagramId) void deleteInstagramVideo(item.id, item.video.instagramId);
    update({ video: parsed, links: item.links.includes(link) ? item.links : [...item.links, link] });
    setUrl("");
    setEdit(false);
  };
  if (item.video && !edit)
    return (
      <div className="space-y-2">
        <VideoPlayer itemId={item.id} video={item.video} playing={false} />
        <Button variant="ghost" size="sm" onClick={() => setEdit(true)} className="w-full">
          <RefreshCw className="size-4" /> Заменить видео
        </Button>
      </div>
    );
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            autoFocus={edit}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            inputMode="url"
            placeholder="Ссылка YouTube (можно с таймкодом) или Instagram"
            className="h-12 pl-10 text-sm"
          />
        </div>
        <Button variant="secondary" size="icon" aria-label="Сохранить видео" onClick={save} className="size-12">
          <Check />
        </Button>
      </div>
      {!!url.trim() && !parsed && <p className="px-1 text-xs text-guide">Не похоже на ссылку YouTube или Instagram</p>}
    </div>
  );
}

function BoardBlock({ item, update }: { item: Item; update: (patch: Partial<Item>) => void }) {
  const [edit, setEdit] = useState(!item.theory);
  const link = item.theory ?? DEFAULT_BOARD;
  return (
    <div className="space-y-2">
      {edit && (
        <div className="space-y-2">
          <TheoryPicker value={link} onChange={(theory) => update({ theory })} />
          <Button
            variant="secondary"
            onClick={() => {
              if (!item.theory) update({ theory: link });
              setEdit(false);
            }}
            className="w-full"
          >
            <Check /> Готово
          </Button>
        </div>
      )}
      {item.theory && <ItemBoard link={item.theory} />}
      {!edit && (
        <Button variant="ghost" size="sm" onClick={() => setEdit(true)} className="w-full">
          <Pencil className="size-4" /> Изменить гамму или аккорд
        </Button>
      )}
    </div>
  );
}

type Tempo = Pick<Item, "startBpm" | "targetBpm">;

/** Start and target tempo. No rhythm here: it can change even within one exercise, it's set on the metronome. */
export function MetronomeBlock({ item, update }: { item: Tempo; update: (patch: Partial<Tempo>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="Начать с, bpm" min={0} value={item.startBpm ?? 0} onChange={(v) => update({ startBpm: v || null })} />
      <NumberField label="Цель, bpm" min={0} value={item.targetBpm ?? 0} onChange={(v) => update({ targetBpm: v || null })} />
    </div>
  );
}
