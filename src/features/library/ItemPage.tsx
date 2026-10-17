import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Dumbbell, Pencil, SearchX, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Toggle } from "@/components/ui";
import { TYPE_ICON } from "@/components/ui/icons";
import { isExercise, isMastered, masteredPatch } from "@/lib/library";
import { ItemBlocks } from "./ItemBlocks";
import { useData } from "@/store/data";
import { TYPE_META } from "@/shared/types";

export function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const item = data.items.find((i) => i.id === id);
  const [editTitle, setEditTitle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!item)
    return (
      <div className="flex flex-col items-center gap-2 pt-12 text-center text-muted">
        <SearchX className="size-10 opacity-50" />
        Элемент не найден
      </div>
    );
  const exercise = isExercise(item);
  const TypeIcon = exercise ? Dumbbell : TYPE_ICON[item.type];

  const update = (patch: Parameters<typeof data.updateItem>[1]) => data.updateItem(item.id, patch);

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="soft">
          <TypeIcon /> {exercise ? "Упражнение" : TYPE_META[item.type].title}
        </Badge>
        {item.category && <Badge>{item.category}</Badge>}
      </div>
      {/* Plain text until the pencil is tapped — a stray tap shouldn't open the keyboard. */}
      {editTitle ? (
        <Input
          autoFocus
          value={item.title}
          onChange={(e) => update({ title: e.target.value })}
          onBlur={() => setEditTitle(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditTitle(false)}
          aria-label="Название"
          className="text-xl font-bold"
        />
      ) : (
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-[1.75rem] font-bold leading-tight tracking-tight">{item.title}</h1>
          <Button variant="ghost" size="icon-sm" aria-label="Переименовать" onClick={() => setEditTitle(true)} className="mt-0.5">
            <Pencil className="size-4" />
          </Button>
        </div>
      )}


      <ItemBlocks item={item} />

      {/* Only pieces get the "learned" mark; exercises are practised, not finished. */}
      {!exercise && (
        <Card className="py-1">
          <Toggle label="Произведение разобрано" checked={isMastered(item)} onChange={(on) => update(masteredPatch(item, on))} />
        </Card>
      )}

      {confirmDelete ? (
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => {
              data.removeItem(item.id);
              navigate("/library", { replace: true });
            }}
            className="flex-1"
          >
            <Trash2 /> Да, удалить
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
            Отмена
          </Button>
        </div>
      ) : (
        <Button variant="destructive-ghost" onClick={() => setConfirmDelete(true)} className="w-full">
          <Trash2 className="size-4" /> {exercise ? "Удалить упражнение" : "Удалить произведение"}
        </Button>
      )}
    </div>
  );
}
