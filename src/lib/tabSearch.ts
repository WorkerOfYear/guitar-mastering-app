// Looking a song's tabs and sheet music up on the web: Songsterr and Ultimate Guitar through /api/tabs,
// MuseScore (and the same two sites) as plain search links that open in the browser.
import type { TabResult, TabSource } from "../../api/tabs";

export type { TabResult, TabSource };

export const SOURCE_NAME: Record<TabSource | "musescore", string> = { songsterr: "Songsterr", ug: "Ultimate Guitar", musescore: "MuseScore" };

export const searchPage = (source: TabSource | "musescore", q: string) => {
  const e = encodeURIComponent(q);
  return {
    songsterr: `https://www.songsterr.com/?pattern=${e}`,
    ug: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${e}`,
    musescore: `https://musescore.com/sheetmusic?text=${e}`,
  }[source];
};

export async function searchTabs(q: string, signal?: AbortSignal): Promise<{ results: TabResult[]; failed: TabSource[] }> {
  const r = await fetch(`/api/tabs?q=${encodeURIComponent(q)}`, { signal });
  const data = (await r.json().catch(() => ({}))) as { results?: TabResult[]; failed?: TabSource[]; error?: string };
  if (!r.ok) throw new Error(data.error || `Ошибка сервера (${r.status})`);
  return { results: data.results ?? [], failed: data.failed ?? [] };
}
