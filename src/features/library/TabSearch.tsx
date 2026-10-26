import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Download, ExternalLink, LoaderCircle, Plus, Search, Star } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { searchPage, searchTabs, SOURCE_NAME, type TabResult, type TabSource } from "@/lib/tabSearch";
import { fetchScore } from "@/lib/scoreDownload";
import { useAuth } from "@/store/auth";

/** Results shown at first and added by each «Показать ещё». */
const PAGE = 6;

/**
 * Finds the song's tabs on Songsterr and Ultimate Guitar and its scores on MuseScore, and lets the user pick links
 * to attach; each site's search page is a link too, for what the server didn't find.
 * `query` follows the video or item title until the user edits it; `auto` searches as soon as it arrives.
 * With `onScore` and the score server connected, a MuseScore result has a download button instead of the plus: the
 * server takes its MusicXML, `onScore` gets the file (and attaches the link). When it can't (paid scores), the link
 * is attached anyway — PDF and mp3 still come from it.
 */
export function TabSearch({
  query,
  auto,
  picked,
  onToggle,
  onScore,
}: {
  query: string;
  auto: boolean;
  picked: string[];
  onToggle: (url: string) => void;
  onScore?: (data: ArrayBuffer, name: string, url: string) => void | Promise<void>;
}) {
  const scoreReady = useAuth((s) => s.server.score);
  const [loading, setLoading] = useState<string | null>(null);
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

  const download = async (r: TabResult) => {
    if (!onScore || loading) return;
    setLoading(r.url);
    try {
      const { data, name } = await fetchScore(r.url, "musicxml");
      await onScore(data, name, r.url);
      toast.success("Ноты загружены в табы", { description: name });
    } catch (e) {
      if (!picked.includes(r.url)) onToggle(r.url);
      toast.error("MusicXML не скачался — ссылка прикреплена", { description: (e as Error).message });
    } finally {
      setLoading(null);
    }
  };

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
            <ResultRow
              key={r.url}
              r={r}
              picked={picked.includes(r.url)}
              onToggle={() => onToggle(r.url)}
              onDownload={onScore && scoreReady && r.source === "musescore" ? () => void download(r) : undefined}
              loading={loading === r.url}
            />
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

function ResultRow({
  r,
  picked,
  onToggle,
  onDownload,
  loading,
}: {
  r: TabResult;
  picked: boolean;
  onToggle: () => void;
  onDownload?: () => void;
  loading: boolean;
}) {
  // Downloadable and not taken yet: the button fetches the file; once taken it unpins the link like the plus does.
  const get = onDownload && !picked;
  return (
    <div className={cn("flex items-center gap-2 rounded-2xl border py-1.5 pl-3 pr-1.5 transition-colors", picked ? "border-accent bg-accent/10" : "border-line")}>
      <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {[r.artist, r.title].filter(Boolean).join(" — ")}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span>{SOURCE_NAME[r.source]}</span>
          <Badge variant={r.kind === "Guitar Pro" || r.kind === "Таб + плеер" || r.kind === "Ноты" ? "soft" : "secondary"} className="px-2 py-0 text-[10px]">
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
          {r.parts && <span className="truncate">{r.parts}</span>}
        </div>
      </a>
      <Button
        variant={picked ? "default" : "ghost"}
        size="icon-sm"
        aria-label={picked ? "Не прикреплять" : get ? "Скачать ноты в табы" : "Прикрепить ссылку"}
        aria-pressed={picked}
        disabled={loading}
        onClick={() => {
          haptic();
          if (get) onDownload();
          else onToggle();
        }}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : picked ? <Check className="size-4" /> : get ? <Download className="size-4" /> : <Plus className="size-4" />}
      </Button>
    </div>
  );
}
