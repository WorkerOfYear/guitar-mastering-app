import { useState } from "react";
import { Check, Pencil, Video } from "lucide-react";
import { Button, Card, Chip, Input, NumberField, ScrollRow, Textarea } from "@/components/ui";
import { ItemBoard } from "@/components/fretboard/ItemBoard";
import { DEFAULT_BOARD, TheoryPicker } from "@/components/fretboard/TheoryPicker";
import { YouTubePlayer } from "@/components/video/YouTubePlayer";
import { addBlockPatch, blocksOf, removeBlockPatch } from "@/lib/library";
import { parseYouTube, withScheme } from "@/lib/youtubeLink";
import { useData } from "@/store/data";
import { SUBDIVISION_META, type BlockId, type Item, type Subdivision } from "@/shared/types";
import { BlockPicker, BlockShell } from "./blocks";
import { MediaCard } from "./MediaCard";
import { TakesList } from "./Takes";

/** An exercise's card body: its blocks in order, then chips to add more. */
export function ExerciseBlocks({ item }: { item: Item }) {
  const { updateItem } = useData();
  const update = (patch: Partial<Item>) => updateItem(item.id, patch);
  const blocks = blocksOf(item);
  return (
    <div className="space-y-4">
      {blocks.map((id) => (
        <BlockShell key={id} id={id} onRemove={() => update(removeBlockPatch(item, id))}>
          <BlockBody id={id} item={item} update={update} />
        </BlockShell>
      ))}
      {!blocks.length && <p className="px-1 text-sm text-muted">Собери упражнение из блоков: видео, ноты, гриф, метроном и другие.</p>}
      <BlockPicker have={blocks} onAdd={(id) => update(addBlockPatch(item, id))} />
    </div>
  );
}

function BlockBody({ id, item, update }: { id: BlockId; item: Item; update: (patch: Partial<Item>) => void }) {
  switch (id) {
    case "video":
      return <VideoBlock item={item} update={update} />;
    case "score":
      return <MediaCard item={item} scoreOnly />;
    case "board":
      return <BoardBlock item={item} update={update} />;
    case "metronome":
      return <MetronomeBlock item={item} update={update} />;
    case "notes":
      return (
        <Card>
          <Textarea
            value={item.notes ?? item.description ?? ""}
            onChange={(e) => update({ notes: e.target.value, description: undefined })}
            rows={4}
            placeholder="Что получается, где ошибаюсь, на что обратить внимание"
          />
        </Card>
      );
    case "recorder":
      return (
        <Card>
          <TakesList itemId={item.id} />
        </Card>
      );
  }
}

/** The video, or a field for its link until there is one. */
export function VideoBlock({ item, update }: { item: Item; update: (patch: Partial<Item>) => void }) {
  const [url, setUrl] = useState("");
  const [edit, setEdit] = useState(false);
  const parsed = url.trim() ? parseYouTube(url) : null;
  const save = () => {
    if (!parsed) return;
    const link = withScheme(url);
    update({ video: parsed, links: item.links.includes(link) ? item.links : [...item.links, link] });
    setUrl("");
    setEdit(false);
  };
  if (item.video && !edit)
    return (
      <div className="space-y-2">
        <YouTubePlayer videoId={item.video.youtubeId} start={item.video.start} playing={false} />
        <Button variant="ghost" size="sm" onClick={() => setEdit(true)} className="w-full">
          <Pencil className="size-4" /> Другое видео
        </Button>
      </div>
    );
  return (
    <Card className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            autoFocus={edit}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            inputMode="url"
            placeholder="Ссылка YouTube (можно с таймкодом)"
            className="h-12 pl-10 text-sm"
          />
        </div>
        <Button variant="secondary" size="icon" aria-label="Сохранить видео" onClick={save} className="size-12">
          <Check />
        </Button>
      </div>
      {!!url.trim() && !parsed && <p className="px-1 text-xs text-guide">Не похоже на ссылку YouTube</p>}
    </Card>
  );
}

function BoardBlock({ item, update }: { item: Item; update: (patch: Partial<Item>) => void }) {
  const [edit, setEdit] = useState(!item.theory);
  const link = item.theory ?? DEFAULT_BOARD;
  return (
    <div className="space-y-2">
      {edit && (
        <Card className="space-y-2">
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
        </Card>
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

type Tempo = Pick<Item, "startBpm" | "targetBpm" | "subdivision">;

export function MetronomeBlock({ item, update }: { item: Tempo; update: (patch: Partial<Tempo>) => void }) {
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Начать с, bpm" min={0} value={item.startBpm ?? 0} onChange={(v) => update({ startBpm: v || null })} />
        <NumberField label="Цель, bpm" min={0} value={item.targetBpm ?? 0} onChange={(v) => update({ targetBpm: v || null })} />
      </div>
      <ScrollRow>
        {([1, 2, 3, 4, 6] as Subdivision[]).map((s) => (
          <Chip key={s} active={item.subdivision === s} onClick={() => update({ subdivision: s })}>
            {SUBDIVISION_META[s]}
          </Chip>
        ))}
      </ScrollRow>
    </Card>
  );
}
