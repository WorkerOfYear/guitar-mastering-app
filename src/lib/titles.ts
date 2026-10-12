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
