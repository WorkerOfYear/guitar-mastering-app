// Reading a pasted YouTube link: the video id and the start time.

/** "youtube.com/watch?v=ID" (copied without the scheme) → "https://youtube.com/watch?v=ID"; full links stay as they are. */
export const withScheme = (url: string) => (/^[a-z][a-z\d+.-]*:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim().replace(/^\/+/, "")}`);

/** "https://youtu.be/ID?t=73" / "watch?v=ID&t=1m13s" / "youtube.com/shorts/ID" → { youtubeId, start } */
export function parseYouTube(url: string) {
  try {
    const u = new URL(withScheme(url));
    if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null;
    const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : (u.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([^/]+)/.exec(u.pathname)?.[1]);
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? "0";
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
    const start = m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
    return { youtubeId: id, start };
  } catch {
    return null;
  }
}
