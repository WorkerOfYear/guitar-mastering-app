import { useNavigate } from "react-router-dom";
import { ExternalLink, FileUp } from "lucide-react";
import { Badge, Button, Card, Progress, Stat } from "@/components/ui";
import { TYPE_ICON } from "@/components/ui/icons";
import { cleanBpm, findSection, lastEntry, targetBpm } from "@/lib/progress";
import { shownText } from "@/lib/library";
import { localDate } from "@/lib/date";
import { useData } from "@/store/data";
import { TYPE_META, type PlanEntry } from "@/shared/types";

const RESULT_LABEL = { clean: "чисто", errors: "с ошибками", fail: "не получилось" } as const;

/** What to play: description, tempo history and links. The neck is shown by the session itself. */
export function EntryCard({ entry }: { entry: PlanEntry }) {
  const { items, log } = useData();
  const navigate = useNavigate();
  const item = items.find((i) => i.id === entry.itemId);
  if (!item) return <Card>Элемент удалён из библиотеки</Card>;
  const section = findSection(item, entry.sectionId);
  const clean = cleanBpm(log, entry, localDate());
  const last = lastEntry(log, entry);
  const target = targetBpm(item, entry.sectionId);
  const TypeIcon = TYPE_ICON[item.type];
  const text = shownText(item);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="soft">
          <TypeIcon /> {item.category ?? TYPE_META[item.type].title}
        </Badge>
      </div>
      <div className="mt-2 text-xl font-bold leading-tight">{item.title}</div>
      {section && <div className="text-lg font-semibold text-accent">{section.title}</div>}
      {text.description && <p className="mt-2 text-sm text-muted">{text.description}</p>}

      {(clean || target || last) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="чистый темп" value={clean ?? "—"} />
          <Stat label="цель" value={target ?? "—"} />
          <Stat label="последний раз" value={last ? `${last.bpm ?? "—"}` : "—"} hint={last ? RESULT_LABEL[last.result] : undefined} />
        </div>
      )}
      {clean && target ? <Progress className="mt-3" value={(clean / target) * 100} /> : null}

      {item.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.links.map((url) => (
            <Button key={url} asChild variant="secondary" size="sm">
              <a href={url} target="_blank" rel="noreferrer">
                {linkLabel(url)} <ExternalLink className="size-4 text-muted" />
              </a>
            </Button>
          ))}
        </div>
      )}
      {item.type === "song" && !item.tabFile && (
        <Button variant="dashed" onClick={() => navigate(`/library/${item.id}`)} className="mt-3 w-full whitespace-normal">
          <FileUp /> Загрузи Guitar Pro файл — будет играть как в Songsterr
        </Button>
      )}
      {text.notes && <p className="mt-3 whitespace-pre-wrap rounded-2xl border-l-4 border-accent/60 bg-surface-2/60 p-3 text-sm">{text.notes}</p>}
    </Card>
  );
}

export function linkLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("songsterr")) return "Songsterr";
    if (host.includes("ultimate-guitar")) return "Ultimate Guitar";
    if (host.includes("musescore")) return "MuseScore";
    return host;
  } catch {
    return "Ссылка";
  }
}
