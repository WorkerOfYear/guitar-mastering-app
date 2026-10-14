import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, LoaderCircle, Plus, Search, Star } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { searchPage, searchTabs, SOURCE_NAME, type TabResult, type TabSource } from "@/lib/tabSearch";

/** Results shown at first and added by each «Показать ещё». */
const PAGE = 6;

/**
 * Finds the song's tabs on Songsterr and Ultimate Guitar and lets the user pick links to attach;
 * MuseScore (sheet music) is a search link, its site doesn't let a server read it.
 * `query` follows the video or item title until the user edits it; `auto` searches as soon as it arrives.
 */
export function TabSearch({ query, auto, picked, onToggle }: { query: string; auto: boolean; picked: string[]; onToggle: (url: string) => void }) {
  const [q, setQ] = useState(query);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ q: string; results: TabResult[]; failed: TabSource[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const ctl = useRef<AbortController | null>(null);

  const run = async (text: string) => {
    text = text.trim();
    if (text.length < 2) return;
    ctl.current?.abort();
    const c = (ctl.current = new AbortController());
    setBusy(true);
    setError(null);
    try {
      const r = await searchTabs(text, c.signal);
      if (!c.signal.aborted) {
        setFound({ q: text, ...r });
        setShown(PAGE);
      }
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };

  useEffect(() => {
    if (touched) return;
    setQ(query);
    if (auto && query) void run(query);
  }, [query, auto]);
  useEffect(() => () => ctl.current?.abort(), []);

  const shownQ = found?.q ?? q.trim();

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          haptic();
          void run(q);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setTouched(true);
            }}
            placeholder="Исполнитель и песня"
            className="h-11 pl-10 text-sm"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="h-11" disabled={busy || q.trim().length < 2}>
          {busy ? <LoaderCircle className="animate-spin" /> : "Найти"}
        </Button>
      </form>

      {error && <p className="px-1 text-xs text-guide">Поиск не удался: {error}</p>}

      {found && (
        <div className="space-y-1.5">
          {found.results.length === 0 && !found.failed.length && <p className="px-1 text-xs text-muted">Ничего не нашлось — попробуй уточнить запрос</p>}
          {found.results.slice(0, shown).map((r) => (
            <ResultRow key={r.url} r={r} picked={picked.includes(r.url)} onToggle={() => onToggle(r.url)} />
          ))}
          {found.results.length > shown && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted"
              onClick={() => {
                haptic();
                setShown((n) => n + PAGE);
              }}
            >
              Показать ещё · осталось {found.results.length - shown}
              <ChevronDown className="size-4" />
            </Button>
          )}
          {found.failed.length > 0 && (
            <p className="px-1 text-xs text-muted">{found.failed.map((s) => SOURCE_NAME[s]).join(" и ")} сейчас не ответил — открой поиск ниже</p>
          )}
        </div>
      )}

      {shownQ.length >= 2 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs">
          {(["musescore", "songsterr", "ug"] as const).map((s) => (
            <a key={s} href={searchPage(s, shownQ)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent">
              <ExternalLink className="size-3.5" />
              {s === "musescore" ? "Ноты на MuseScore" : SOURCE_NAME[s]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ r, picked, onToggle }: { r: TabResult; picked: boolean; onToggle: () => void }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-2xl border py-1.5 pl-3 pr-1.5 transition-colors", picked ? "border-accent bg-accent/10" : "border-line")}>
      <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {r.artist} — {r.title}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span>{SOURCE_NAME[r.source]}</span>
          <Badge variant={r.kind === "Guitar Pro" || r.kind === "Таб + плеер" ? "soft" : "secondary"} className="px-2 py-0 text-[10px]">
            {r.kind}
          </Badge>
          {r.rating != null && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3" />
              {r.rating}
              {r.votes != null && ` · ${r.votes}`}
            </span>
          )}
          {r.difficulty != null && <span>сложность {r.difficulty}</span>}
        </div>
      </a>
      <Button
        variant={picked ? "default" : "ghost"}
        size="icon-sm"
        aria-label={picked ? "Не прикреплять" : "Прикрепить ссылку"}
        aria-pressed={picked}
        onClick={() => {
          haptic();
          onToggle();
        }}
      >
        {picked ? <Check className="size-4" /> : <Plus className="size-4" />}
      </Button>
    </div>
  );
}
