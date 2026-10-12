import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui";
import { cleanBpm, findSection, lastEntry, targetBpm } from "@/lib/progress";
import { localDate } from "@/lib/date";
import { useData } from "@/store/data";
import { useSettings } from "@/store/settings";
import { SUBDIVISION_META, TYPE_META, type PlanEntry } from "@/shared/types";

const RESULT_LABEL = { clean: "чисто", errors: "с ошибками", fail: "не получилось" } as const;

/** What to play: description, tempo history and links. */
export function EntryCard({ entry }: { entry: PlanEntry }) {
  const { items, log } = useData();
  const setTheory = useSettings((s) => s.setTheory);
  const navigate = useNavigate();
  const item = items.find((i) => i.id === entry.itemId);
  if (!item) return <Card>Элемент удалён из библиотеки</Card>;
  const section = findSection(item, entry.sectionId);
  const clean = cleanBpm(log, entry, localDate());
  const last = lastEntry(log, entry);
  const target = targetBpm(item, entry.sectionId);

  return (
    <Card>
      <div className="text-xs text-muted">
        {TYPE_META[item.type].icon} {item.category ?? TYPE_META[item.type].title}
        {item.subdivision && <> · {SUBDIVISION_META[item.subdivision]}</>}
      </div>
      <div className="mt-0.5 text-xl font-bold leading-tight">{item.title}</div>
      {section && <div className="text-lg font-semibold text-accent">{section.title}</div>}
      {item.description && <p className="mt-2 text-sm text-muted">{item.description}</p>}

      {(clean || target || last) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="чистый темп" value={clean ?? "—"} />
          <Stat label="цель" value={target ?? "—"} />
          <Stat label="последний раз" value={last ? `${last.bpm ?? "—"}` : "—"} hint={last ? RESULT_LABEL[last.result] : undefined} />
        </div>
      )}
      {clean && target ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (clean / target) * 100)}%` }} />
        </div>
      ) : null}

      {(item.links.length > 0 || item.theory) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.theory && (
            <button
              type="button"
              onClick={() => {
                setTheory({ ...item.theory!, scaleId: item.theory!.scaleId ?? "ionian", chordType: item.theory!.chordType ?? "maj7", diatonic: item.theory!.diatonic ?? 0, position: 0 });
                navigate("/theory");
              }}
              className="h-10 rounded-xl bg-surface-2 px-3 text-sm font-semibold"
            >
              🎼 На грифе
            </button>
          )}
          {item.links.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="flex h-10 items-center rounded-xl bg-surface-2 px-3 text-sm font-semibold">
              {linkLabel(url)} ↗
            </a>
          ))}
        </div>
      )}
      {item.type === "song" && !item.tabFile && (
        <button
          type="button"
          onClick={() => navigate(`/library/${item.id}`)}
          className="mt-3 h-11 w-full rounded-2xl border border-dashed border-line text-sm font-semibold"
        >
          📄 Загрузи Guitar Pro файл — будет играть как в Songsterr
        </button>
      )}
      {item.notes && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-surface-2 p-3 text-sm">{item.notes}</p>}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-2 py-2">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] leading-tight text-muted">{label}</div>
      {hint && <div className="text-[10px] leading-tight text-muted">{hint}</div>}
    </div>
  );
}

export function linkLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("songsterr")) return "Songsterr";
    if (host.includes("ultimate-guitar")) return "Ultimate Guitar";
    return host;
  } catch {
    return "Ссылка";
  }
}
