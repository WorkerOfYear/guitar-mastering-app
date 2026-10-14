// Looking a song's tabs and sheet music up on the web: Songsterr, Ultimate Guitar and MuseScore (when the server
// has a search key) through /api/tabs, plus each site's own search page as a link that opens in the browser.
import type { TabResult, TabSource } from "../../api/tabs";

export type { TabResult, TabSource };

export const SOURCE_NAME: Record<TabSource, string> = { songsterr: "Songsterr", ug: "Ultimate Guitar", musescore: "MuseScore" };

export const searchPage = (source: TabSource, q: string) => {
  const e = encodeURIComponent(q);
  return {
    songsterr: `https://www.songsterr.com/?pattern=${e}`,
    ug: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${e}`,
    musescore: `https://musescore.com/sheetmusic?text=${e}`,
  }[source];
};

export async function searchTabs(q: string, signal?: AbortSignal): Promise<{ results: TabResult[]; failed: TabSource[] }> {
  const r = await fetch(`/api/tabs?q=${encodeURIComponent(q)}`, { signal });
  const data = (await r.json().catch(() => null)) as { results?: TabResult[]; failed?: TabSource[]; error?: string } | null;
  if (!r.ok) throw new Error(data?.error || `Ошибка сервера (${r.status})`);
  // A host without the function (a static copy of the app) answers with the app's own page.
  if (!Array.isArray(data?.results)) throw new Error("на этом сервере нет поиска — открой сайты по ссылкам ниже");
  return { results: data.results, failed: data.failed ?? [] };
}
