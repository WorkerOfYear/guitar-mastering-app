// Audio of a YouTube video, from the user's own server (server/youtube-audio). YouTube blocks
// downloads from cloud hosting like Vercel, so the app can't do it itself.

export interface AudioServer {
  url: string;
  key: string;
}

export const serverReady = (s: AudioServer) => !!s.url.trim() && !!s.key.trim();

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

/** Downloads the audio; the file name is the video title. */
export async function fetchYoutubeAudio(videoId: string, server: AudioServer): Promise<{ data: ArrayBuffer; name: string }> {
  let r: Response;
  try {
    r = await fetch(`${base(server)}/audio?id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${server.key.trim()}` } });
  } catch {
    throw new Error("Сервер не отвечает — проверь адрес в настройках");
  }
  if (!r.ok) throw new Error(await failure(r));
  const type = r.headers.get("Content-Type") ?? "";
  const ext = type.includes("mp4") ? "m4a" : type.includes("webm") ? "webm" : type.includes("mpeg") ? "mp3" : "audio";
  const title = decodeURIComponent(r.headers.get("X-Title") ?? "") || videoId;
  return { data: await r.arrayBuffer(), name: `${title}.${ext}` };
}

/** Checks the address and the key (an invalid video id only passes the key check). */
export async function checkServer(server: AudioServer): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${base(server)}/audio?id=-`, { headers: { Authorization: `Bearer ${server.key.trim()}` } });
  } catch {
    throw new Error("Сервер не отвечает — проверь адрес");
  }
  if (r.status === 401) throw new Error("Сервер отвечает, но ключ неверный");
  if (r.status !== 400) throw new Error(await failure(r));
  return "Сервер на связи, ключ верный";
}
