// Sheet music from MuseScore: the owner's API asks its neighbour server/score-download, where a real browser opens
// the score page. MuseScore sits behind a Cloudflare check that cloud hosting can't pass, so the app can't do it itself.
import { apiFetch, failure } from "./api";

/** MusicXML needs a MuseScore account on the server and works for free scores only. */
export type ScoreFormat = "pdf" | "midi" | "mp3" | "musicxml";
const EXT: Record<ScoreFormat, string> = { pdf: "pdf", midi: "mid", mp3: "mp3", musicxml: "mxl" };

/** A link to a score on musescore.com, or null. */
export const museScoreLink = (links: string[]) => links.find((l) => /^https:\/\/(?:(?:s|www)\.)?musescore\.com\/\S+$/.test(l)) ?? null;

/** Asks the server for the score in one format; the file name comes from MuseScore. */
export async function fetchScore(link: string, format: ScoreFormat): Promise<{ data: ArrayBuffer; name: string }> {
  const r = await apiFetch(`/api/score?type=${format}&url=${encodeURIComponent(link)}`);
  if (!r.ok) throw new Error(await failure(r));
  const name = decodeURIComponent(r.headers.get("X-Name") ?? "") || `score.${EXT[format]}`;
  return { data: await r.arrayBuffer(), name };
}

/** Saves a file to the device. */
export function saveFile(data: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([data]));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const TRIED_KEY = "guitar:score-auto";
const tried = new Set<string>();

/**
 * True the first time an item's MuseScore link is seen on this device: its MusicXML is then taken into the tabs
 * without asking. Only once, so a paid score (no MusicXML) doesn't keep the server's browser busy on every visit.
 */
export function firstScoreTry(itemId: string, link: string): boolean {
  const key = `${itemId} ${link}`;
  if (tried.has(key)) return false;
  tried.add(key);
  try {
    const list = JSON.parse(localStorage.getItem(TRIED_KEY) ?? "[]") as string[];
    if (list.includes(key)) return false;
    localStorage.setItem(TRIED_KEY, JSON.stringify([...list, key].slice(-200)));
  } catch {
    // No storage: the in-memory set still keeps it to once per visit.
  }
  return true;
}
