// Audio of a YouTube or Instagram video. The owner's API asks its neighbour server/youtube-audio for it
// (YouTube blocks downloads from cloud hosting like Vercel, so the app can't do it itself).

import type { VideoLink } from "@/shared/types";
import { apiFetch, failure } from "./api";

const ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Downloads the audio; the file name is the video title. With `saveFor` the server also keeps it as that item's
 * recording (`updatedAt` says which version). A dropped connection or a 5xx (server busy, the site refusing once)
 * is retried; anything else is not.
 */
export async function fetchVideoAudio(
  video: VideoLink,
  saveFor?: string,
  onAttempt?: (attempt: number, of: number) => void,
): Promise<{ data: ArrayBuffer; name: string; updatedAt: number | null }> {
  const videoId = video.instagramId ?? video.youtubeId;
  const query = `${video.instagramId !== undefined ? "ig" : "id"}=${encodeURIComponent(videoId)}${saveFor ? `&save=${encodeURIComponent(saveFor)}` : ""}`;
  let r: Response | null = null;
  let error = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(attempt * 2000);
    onAttempt?.(attempt, ATTEMPTS);
    try {
      r = await apiFetch(`/api/audio?${query}`);
    } catch (e) {
      r = null;
      error = (e as Error).message;
      continue;
    }
    if (r.ok || r.status < 500) break;
    error = await failure(r);
    r = null;
  }
  if (!r) throw new Error(error);
  if (!r.ok) throw new Error(await failure(r));
  const type = r.headers.get("Content-Type") ?? "";
  const ext = type.includes("mp4") ? "m4a" : type.includes("webm") ? "webm" : type.includes("mpeg") ? "mp3" : "audio";
  const title = decodeURIComponent(r.headers.get("X-Title") ?? "") || videoId;
  return { data: await r.arrayBuffer(), name: `${title}.${ext}`, updatedAt: Number(r.headers.get("X-Updated")) || null };
}
