// Sheet music from MuseScore, via the user's own server (server/score-download) that runs dl-librescore.
// MuseScore sits behind a Cloudflare check that cloud hosting can't pass, so the app can't do it itself.
import type { AudioServer } from "./youtubeAudio";

export type ScoreFormat = "pdf" | "midi" | "mp3";

/** A link to a score on musescore.com, or null. */
export const museScoreLink = (links: string[]) => links.find((l) => /^https:\/\/(?:(?:s|www)\.)?musescore\.com\/\S+$/.test(l)) ?? null;

const base = (s: AudioServer) => {
  const url = s.url.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
};

async function failure(r: Response) {
  const text = await r.text().catch(() => "");
  try {
    return (JSON.parse(text) as { error?: string }).error ?? `Ошибка сервера ${r.status}`;
  } catch {
    return `Ошибка сервера ${r.status}`;
  }
}

/** Asks the server for the score in one format; the file name comes from MuseScore. */
export async function fetchScore(link: string, format: ScoreFormat, server: AudioServer): Promise<{ data: ArrayBuffer; name: string }> {
  let r: Response;
  try {
    r = await fetch(`${base(server)}/score?type=${format}&url=${encodeURIComponent(link)}`, { headers: { Authorization: `Bearer ${server.key.trim()}` } });
  } catch {
    throw new Error("Сервер не отвечает — проверь адрес в настройках");
  }
  if (!r.ok) throw new Error(await failure(r));
  const name = decodeURIComponent(r.headers.get("X-Name") ?? "") || `score.${format === "midi" ? "mid" : format}`;
  return { data: await r.arrayBuffer(), name };
}

/** Checks the address and the key (an invalid format only passes the key check). */
export async function checkScoreServer(server: AudioServer): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${base(server)}/score?type=-`, { headers: { Authorization: `Bearer ${server.key.trim()}` } });
  } catch {
    throw new Error("Сервер не отвечает — проверь адрес");
  }
  if (r.status === 401) throw new Error("Сервер отвечает, но ключ неверный");
  if (r.status !== 400) throw new Error(await failure(r));
  return "Сервер на связи, ключ верный";
}
