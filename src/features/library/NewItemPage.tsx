import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Chip, ScrollRow } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";
import { useData } from "@/store/data";
import { TYPE_META, type ItemStatus, type ItemType } from "@/shared/types";

const TYPES: ItemType[] = ["technique", "song", "lick", "theory"];

export function NewItemPage() {
  const addItem = useData((s) => s.addItem);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ItemType>("technique");
  const [status, setStatus] = useState<ItemStatus>("queue");
  const [sections, setSections] = useState("");

  const create = () => {
    if (!title.trim()) return;
    const id = addItem({
      title: title.trim(),
      type,
      status,
      links: [],
      ...(type === "technique" || type === "lick" ? { startBpm: 60, targetBpm: 120, subdivision: 4 as const } : {}),
      ...(type === "song"
        ? {
            sections: sections
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s, i) => ({ id: `sec${i}`, title: s, status: "queue" as const })),
          }
        : {}),
    });
    navigate(`/library/${id}`, { replace: true });
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Новый элемент" />
      <Card className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название, например «Лик из соло Mr. Big»"
          className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base"
        />
        <ScrollRow>
          {TYPES.map((t) => (
            <Chip key={t} active={t === type} onClick={() => setType(t)}>
              {TYPE_META[t].icon} {TYPE_META[t].title}
            </Chip>
          ))}
        </ScrollRow>
        {type === "song" && (
          <textarea
            value={sections}
            onChange={(e) => setSections(e.target.value)}
            rows={4}
            placeholder={"Разделы, по одному в строке:\nИнтро\nРифф\nСоло"}
            className="w-full rounded-2xl border border-line bg-surface-2 p-4 text-base"
          />
        )}
        <ScrollRow>
          <Chip active={status === "queue"} onClick={() => setStatus("queue")}>
            В очередь
          </Chip>
          <Chip active={status === "active"} onClick={() => setStatus("active")}>
            Сразу в работу
          </Chip>
        </ScrollRow>
      </Card>
      <button
        type="button"
        disabled={!title.trim()}
        onClick={create}
        className="h-14 w-full rounded-2xl bg-accent text-base font-bold text-on-accent disabled:opacity-40"
      >
        Создать
      </button>
    </div>
  );
}
