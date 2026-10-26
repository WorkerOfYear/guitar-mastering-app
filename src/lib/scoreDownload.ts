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

// Answers already had: a score doesn't turn free or paid while the app is open.
const freeScores = new Map<string, boolean>();

/**
 * Whether the score's MusicXML downloads free with the server's account; null when it couldn't tell. Official scores
 * (musescore.com/official_scores/…) are always sold, so they aren't asked about.
 */
export async function isScoreFree(link: string, signal?: AbortSignal): Promise<boolean | null> {
  if (/\/official_scores\//.test(link)) return false;
  const known = freeScores.get(link);
  if (known !== undefined) return known;
  try {
    const r = await apiFetch(`/api/score-check?url=${encodeURIComponent(link)}`, { signal });
    if (!r.ok) return null;
    const { free } = (await r.json()) as { free: boolean };
    freeScores.set(link, free);
    return free;
  } catch {
    return null;
  }
}
