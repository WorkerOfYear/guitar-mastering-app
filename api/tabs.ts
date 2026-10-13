// GET /api/tabs?q=<artist and song> → { results, failed }
// Looks a song up on Songsterr (public JSON search), Ultimate Guitar (results JSON embedded in the search page) and
// MuseScore. Only links are returned: the tabs themselves stay on those sites. None allows cross-origin requests, hence a function.
// MuseScore sits behind a Cloudflare bot check that a server can't pass, so its scores come from Brave Search
// (`site:musescore.com`) — only when BRAVE_SEARCH_KEY is set; without it the app just links to MuseScore's search page.
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

interface BraveResult {
  title?: string;
  url?: string;
}

// A score's page: musescore.com/user/123/scores/456 or musescore.com/<name>/scores/456 — not search, sets or profiles.
const SCORE_URL = /^https:\/\/(?:www\.)?musescore\.com\/(?:[^/?#]+\/)+scores\/\d+\/?$/;

/**
 * MuseScore scores from Brave's web results. Their titles look like
 * "Fuzz Universe – Paul Gilbert Sheet music for Guitar (Solo) | Musescore.com".
 */
export function parseMuseScore(results: BraveResult[]): TabResult[] {
  const seen = new Set<string>();
  return results
    .flatMap((r) => {
      const url = r.url?.replace(/^http:/, "https:").replace(/\/$/, "");
      if (!url || !SCORE_URL.test(url) || seen.has(url)) return [];
      seen.add(url);
      const text = decodeEntities((r.title ?? "").replace(/<[^>]*>/g, ""))
        .replace(/\s*[|–-]\s*musescore(\.com)?\s*$/i, "")
        .trim();
      const [name, parts] = text.split(/\s+sheet music(?: for)?\s*/i);
      const [title, artist = ""] = name.split(/\s+[–—-]\s+/);
      return [{ source: "musescore" as const, artist: artist.trim(), title: title.trim() || "Ноты", kind: "Ноты", url, ...(parts?.trim() ? { parts: parts.trim() } : {}) }];
    })
    .slice(0, MUSESCORE_MAX);
}

async function get(url: string, accept: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en", ...headers },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

const SEARCH: Record<TabSource, (q: string) => Promise<TabResult[]>> = {
  songsterr: async (q) =>
    parseSongsterr((await (await get(`https://www.songsterr.com/api/songs?size=${SONGSTERR_MAX}&pattern=${encodeURIComponent(q)}`, "application/json")).json()) as SongsterrSong[]),
  musescore: async (q) => {
    const url = `https://api.search.brave.com/res/v1/web/search?count=20&q=${encodeURIComponent(`${q} site:musescore.com`)}`;
    const data = (await (await get(url, "application/json", { "X-Subscription-Token": process.env.BRAVE_SEARCH_KEY! })).json()) as {
      web?: { results?: BraveResult[] };
    };
    return parseMuseScore(data.web?.results ?? []);
  },
  ug: async (q) =>
    parseUltimateGuitar(await (await get(`https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`, "text/html")).text()),
};

// No auth: it only reads fixed public sites and returns links, nothing from the owner's data.
export const GET = handle(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 2 || q.length > 120) throw new HttpError(400, "Нужен запрос: исполнитель и название");
  // Results come in this order: Songsterr, MuseScore, UG. MuseScore is skipped, not "failed", without a search key.
  const sources = (Object.keys(SEARCH) as TabSource[]).filter((s) => s !== "musescore" || process.env.BRAVE_SEARCH_KEY);
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
