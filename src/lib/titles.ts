// Names for a new library item when the user leaves the title empty.

/** "01_Technical-Difficulties (live).mp3" → "Technical-Difficulties (live)" */
export function fileTitle(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/_+/g, " ")
    .replace(/^\d{1,3}[\s.-]+(?=\S)/, "") // track number
    .replace(/\s+/g, " ")
    .trim();
}

/** Video title from YouTube's oEmbed endpoint (allows cross-origin requests); null if it can't be read. */
export async function youtubeTitle(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal });
    if (!r.ok) return null;
    const { title } = (await r.json()) as { title?: string };
    return title?.trim() || null;
  } catch {
    return null;
  }
}

/** "Paul Gilbert - Fuzz Universe (Official Audio) [HD]" → "Paul Gilbert Fuzz Universe": a search query for tab sites. */
export function songQuery(videoTitle: string) {
  return videoTitle
    .replace(/[([{【][^)\]}】]*[)\]}】]/g, " ") // (Official Video), [HD], 【MV】
    .replace(/\b(official|music|lyrics?|video|audio|live|cover|guitar lesson|lesson|tutorial|hd|4k|remastered(?: \d{4})?)\b/gi, " ")
    .replace(/\b(ft|feat)\.?\s.*$/i, " ") // featured artists confuse the search
    .replace(/[|/\\"«»“”]/g, " ")
    .replace(/\s+[-–—:]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
