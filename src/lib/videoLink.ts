// A pasted play-along link: YouTube (see youtubeLink.ts) or Instagram.
import type { VideoLink } from "@/shared/types";
import { parseYouTube, withScheme } from "./youtubeLink";

/** "instagram.com/reel/ID", "/p/ID", "/reels/ID", "/tv/ID", "/<user>/reel/ID" → { instagramId } */
export function parseInstagram(url: string) {
  try {
    const u = new URL(withScheme(url));
    if (!/(^|\.)(instagram\.com|instagr\.am)$/.test(u.hostname)) return null;
    const id = /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/.exec(u.pathname)?.[1];
    if (!id || id.length < 5) return null;
    return { instagramId: id };
  } catch {
    return null;
  }
}

export const parseVideo = (url: string): VideoLink | null => parseYouTube(url) ?? parseInstagram(url);

export const videoSite = (v: VideoLink) => (v.instagramId ? "Instagram" : "YouTube");

/** Short address shown under the video in the card. */
export const videoShortUrl = (v: VideoLink) => (v.instagramId ? `instagram.com/reel/${v.instagramId}` : `youtu.be/${v.youtubeId}`);
