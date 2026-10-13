// GET /api/tabs?q=<artist and song> → { results, failed }
// Looks a song up on Songsterr (public JSON search), Ultimate Guitar (results JSON embedded in the search page) and
// MuseScore. Only links are returned: the tabs themselves stay on those sites. None allows cross-origin requests, hence a function.
// MuseScore sits behind a Cloudflare bot check that a server can't pass, so its scores come from a web search API limited
// to musescore.com — Tavily (TAVILY_API_KEY) or Serper (SERPER_API_KEY); without a key the app just links to MuseScore's search.
import { handle, HttpError } from "./_lib.js";

export type TabSource = "songsterr" | "ug" | "musescore";

export interface TabResult {
  source: TabSource;
  artist: string;
  title: string;
  /** "Таб + плеер", "Guitar Pro", "Аккорды", "Ноты"… */
  kind: string;
  /** MuseScore: the instruments the score is for, "Guitar (Solo)". */
  parts?: string;
  url: string;
  rating?: number;
  votes?: number;
  difficulty?: number;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT = 8000;
// The client shows the first few and reveals more on request.
const PER_SOURCE = 20;
// Songsterr adds the artist's other songs after the matches, so keep only its top few.
const SONGSTERR_MAX = 3;
// Scores go between Songsterr and UG, so keep few of them for UG to show up on the first screen too.
const MUSESCORE_MAX = 2;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

interface SongsterrSong {
  songId: number;
  artist: string;
  title: string;
  hasPlayer?: boolean;
  tracks?: { instrument?: string; views?: number; difficulty?: number }[];
}

export function parseSongsterr(songs: SongsterrSong[]): TabResult[] {
  return songs.slice(0, SONGSTERR_MAX).map((s) => {
    // Difficulty of the guitar part people open most.
    const guitar = (s.tracks ?? []).filter((t) => /guitar/i.test(t.instrument ?? "")).sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
    return {
      source: "songsterr",
      artist: s.artist,
      title: s.title,
      kind: s.hasPlayer === false ? "Таб" : "Таб + плеер",
      url: `https://www.songsterr.com/a/wsa/${slug(`${s.artist} ${s.title}`)}-tab-s${s.songId}`,
      ...(guitar?.difficulty ? { difficulty: guitar.difficulty } : {}),
    };
  });
}

const UG_KINDS: Record<string, string> = { Tabs: "Таб", Pro: "Guitar Pro", Official: "Official", Chords: "Аккорды", "Bass Tabs": "Бас" };

interface UgResult {
  song_name?: string;
  artist_name?: string;
  type?: string | null;
  tab_url?: string;
  rating?: number | null;
  votes?: number | null;
  tab_access_type?: string | null;
}

const decodeEntities = (s: string) =>
  s.replace(/&(quot|amp|lt|gt|#039|#39|apos);/g, (_, e: string) => ({ quot: '"', amp: "&", lt: "<", gt: ">", "#039": "'", "#39": "'", apos: "'" })[e]!);

/** Results from the `<div class="js-store" data-content="…">` JSON of a UG search page. */
export function parseUltimateGuitar(html: string): TabResult[] {
  const m = html.match(/class="js-store"\s+data-content="([^"]*)"/);
  if (!m) throw new Error("no js-store");
  const store = JSON.parse(decodeEntities(m[1])) as { store?: { page?: { data?: { results?: UgResult[] } } } };
  const results = store.store?.page?.data?.results ?? [];
  return (
    results
      // Skip ads for the paid app (no type) and kinds a guitarist doesn't need (video lessons, drums, ukulele).
      .filter((r) => r.type && UG_KINDS[r.type] && r.tab_url && r.tab_access_type === "public")
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
      .slice(0, PER_SOURCE)
      .map((r) => ({
        source: "ug" as const,
        artist: r.artist_name ?? "",
        title: r.song_name ?? "",
        kind: UG_KINDS[r.type!],
        url: r.tab_url!,
        ...(r.rating ? { rating: Math.round(r.rating * 10) / 10 } : {}),
        ...(r.votes ? { votes: r.votes } : {}),
      }))
  );
}

interface WebResult {
  title?: string;
  url?: string;
}

// A score's page: musescore.com/user/123/scores/456, /<name>/scores/456 or the newer /<name>/<score-slug>.
const SCORE_URL = /^https:\/\/(?:www\.)?musescore\.com\/(?:user\/\d+\/scores\/\d+|[^/?#]+\/scores\/\d+|([^/?#]+)\/[^/?#]+)\/?$/;
// …but not two-segment pages of the site itself: profiles, artists, songs, catalog.
const NOT_A_SCORER = new Set(["user", "artist", "song", "sheetmusic", "hub", "groups", "official_scores", "courses", "news", "support"]);

/**
 * MuseScore scores from web search results. A score's title is whatever its author called it ("Paul Gilbert - Fuzz Universe
 * guitar intro", "Nothing else matters – Metallica"), so it's shown whole, not split into artist and song. Tails like
 * "Sheet Music for Piano (Solo) | Musescore.com" become `parts`.
 */
export function parseMuseScore(results: WebResult[]): TabResult[] {
  const seen = new Set<string>();
  return results
    .flatMap((r) => {
      const url = r.url?.replace(/^http:/, "https:").replace(/\/$/, "");
      const m = url?.match(SCORE_URL);
      if (!url || !m || (m[1] && NOT_A_SCORER.has(m[1])) || seen.has(url)) return [];
      seen.add(url);
      const text = decodeEntities((r.title ?? "").replace(/<[^>]*>/g, ""))
        .replace(/\s*[|–-]\s*musescore(\.com)?\s*$/i, "")
        .trim();
      const [title, parts] = text.split(/\s+sheet music(?: for)?\s*/i).map((t) => t.trim());
      return [{ source: "musescore" as const, artist: "", title: title || "Ноты", kind: "Ноты", url, ...(parts ? { parts } : {}) }];
    })
    .slice(0, MUSESCORE_MAX);
}

async function get(url: string, accept: string, init: RequestInit = {}) {
  const r = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en", ...(init.headers as Record<string, string>) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

const postJson = async (url: string, headers: Record<string, string>, body: unknown) =>
  (await get(url, "application/json", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })).json();

/** Web pages from musescore.com for the query, through whichever search API has a key (Tavily first). */
async function searchMuseScoreSite(q: string): Promise<WebResult[]> {
  const { TAVILY_API_KEY: tavily, SERPER_API_KEY: serper } = process.env;
  if (tavily) {
    const body = { query: `${q} sheet music`, include_domains: ["musescore.com"], max_results: 20 };
    const data = (await postJson("https://api.tavily.com/search", { Authorization: `Bearer ${tavily}` }, body)) as { results?: WebResult[] };
    return data.results ?? [];
  }
  // 10 results: more costs Serper two credits.
  const body = { q: `${q} site:musescore.com`, num: 10 };
  const data = (await postJson("https://google.serper.dev/search", { "X-API-KEY": serper! }, body)) as { organic?: { title?: string; link?: string }[] };
  return (data.organic ?? []).map((r) => ({ title: r.title, url: r.link }));
}

const hasMuseScoreSearch = () => !!(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY);

const SEARCH: Record<TabSource, (q: string) => Promise<TabResult[]>> = {
  songsterr: async (q) =>
    parseSongsterr((await (await get(`https://www.songsterr.com/api/songs?size=${SONGSTERR_MAX}&pattern=${encodeURIComponent(q)}`, "application/json")).json()) as SongsterrSong[]),
  musescore: async (q) => parseMuseScore(await searchMuseScoreSite(q)),
  ug: async (q) =>
    parseUltimateGuitar(await (await get(`https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`, "text/html")).text()),
};

// No auth: it only reads fixed public sites and returns links, nothing from the owner's data.
export const GET = handle(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 2 || q.length > 120) throw new HttpError(400, "Нужен запрос: исполнитель и название");
  // Results come in this order: Songsterr, MuseScore, UG. MuseScore is skipped, not "failed", without a search key.
  const sources = (Object.keys(SEARCH) as TabSource[]).filter((s) => s !== "musescore" || hasMuseScoreSearch());
  const settled = await Promise.allSettled(sources.map((s) => SEARCH[s](q)));
  const results = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = sources.filter((_, i) => settled[i].status === "rejected");
  return new Response(JSON.stringify({ results, failed }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Same song, same answer: let Vercel's CDN serve repeats for a day — unless a site failed, then retry next time.
      "Cache-Control": failed.length ? "no-store" : "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
});
