import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button, Card, Chip, Input, Segmented, Textarea } from "@/components/ui";
import { TYPE_ICON } from "@/components/ui/icons";
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
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название, например «Лик из соло Mr. Big»" />
        <div className="grid grid-cols-4 gap-2">
          {TYPES.map((t) => {
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
        {type === "song" && (
          <Textarea
            value={sections}
            onChange={(e) => setSections(e.target.value)}
            rows={4}
            placeholder={"Разделы, по одному в строке:\nИнтро\nРифф\nСоло"}
            className="text-base"
          />
        )}
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "queue", label: "В очередь" },
            { value: "active", label: "Сразу в работу" },
          ]}
        />
      </Card>
      <Button size="lg" disabled={!title.trim()} onClick={create} className="w-full">
        <Plus /> Создать
      </Button>
    </div>
  );
}
