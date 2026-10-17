// The owner's helper servers, reached from here so the app never needs their addresses or keys:
//   GET /api/audio?id=<YouTube id> | ?ig=<Instagram code> [&save=<item id>]  → audio from server/youtube-audio
//       (with save it is also stored as that item's recording, so the app doesn't upload it back)
//   GET /api/score?type=<pdf|midi|mp3|musicxml>&url=<musescore link>         → a score from server/score-download
// AUDIO_URL / SCORE_URL default to the ports those services listen on locally; AUDIO_KEY / SCORE_KEY are their KEYs.
import { checkAuth, handle, HttpError } from "./lib.js";
import { FILE_KEY, saveFile } from "./store.js";

const TIMEOUT = 5 * 60_000;

async function forward(url: string, key: string, expose: string[]) {
  let r: Response;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT) });
  } catch {
    throw new HttpError(502, "Сервер не отвечает — он запущен?");
  }
  if (!r.ok) {
    const body = await r.text();
    let error = `Ошибка сервера ${r.status}`;
    try {
      error = (JSON.parse(body) as { error?: string }).error ?? error;
    } catch {
      /* not JSON */
    }
    // 401 from the helper means a wrong KEY in our .env, not a signed-out user.
    throw new HttpError(r.status === 401 ? 502 : r.status, r.status === 401 ? "Неверный ключ сервера в .env API" : error);
  }
  const headers: Record<string, string> = { "Content-Type": r.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" };
  for (const h of expose) {
    const v = r.headers.get(h);
    if (v) headers[h] = v;
  }
  return { data: new Uint8Array(await r.arrayBuffer()), headers };
}

const base = (env: string | undefined, fallback: string) => (env || fallback).replace(/\/+$/, "");

export const audio = handle(async (req) => {
  await checkAuth(req);
  const key = process.env.AUDIO_KEY;
  if (!key) throw new HttpError(503, "Сервер звука не подключён: задай AUDIO_KEY в .env API");
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  const ig = q.get("ig");
  const query = ig ? `ig=${encodeURIComponent(ig)}` : `id=${encodeURIComponent(id ?? "")}`;
  const { data, headers } = await forward(`${base(process.env.AUDIO_URL, "http://127.0.0.1:8787")}/audio?${query}`, key, ["X-Title"]);
  const save = q.get("save");
  if (save && FILE_KEY.test(save)) {
    const type = headers["Content-Type"];
    const ext = type.includes("mp4") ? "m4a" : type.includes("webm") ? "webm" : type.includes("mpeg") ? "mp3" : "audio";
    const title = decodeURIComponent(headers["X-Title"] ?? "") || ig || id || "audio";
    headers["X-Updated"] = String(saveFile(`${save}:audio`, data, type, { name: `${title}.${ext}` }).updatedAt);
  }
  return new Response(data, { headers });
});

export const score = handle(async (req) => {
  await checkAuth(req);
  const key = process.env.SCORE_KEY;
  if (!key) throw new HttpError(503, "Сервер нот MuseScore не подключён: задай SCORE_KEY в .env API");
  const q = new URL(req.url).searchParams;
  const url = `${base(process.env.SCORE_URL, "http://127.0.0.1:8790")}/score?type=${encodeURIComponent(q.get("type") ?? "")}&url=${encodeURIComponent(q.get("url") ?? "")}`;
  const { data, headers } = await forward(url, key, ["X-Name"]);
  return new Response(data, { headers });
});
