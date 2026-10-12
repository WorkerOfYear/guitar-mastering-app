import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerControl } from "@/components/tab/TabPlayer";

// YouTube IFrame Player, controlled from outside like the tab player.

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer; PlayerState: { PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

interface Props {
  videoId: string;
  start?: number;
  playing: boolean;
  onBlocked?: (blocked: boolean) => void;
  control?: RefObject<PlayerControl | null>;
}

export function YouTubePlayer({ videoId, start = 0, playing, onBlocked, control }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;

  useEffect(() => {
    let cancelled = false;
    const el = document.createElement("div");
    host.current?.appendChild(el);
    void loadApi().then(() => {
      if (cancelled || !window.YT) return;
      player.current = new window.YT.Player(el, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { start: Math.floor(start), playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: () => !cancelled && setReady(true) },
      });
      if (control) control.current = { resume: () => player.current?.playVideo() };
    });
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
      setReady(false);
      el.remove();
    };
  }, [videoId, start]);

  useEffect(() => {
    const p = player.current;
    if (!p || !ready) return;
    if (!playing) {
      p.pauseVideo();
      return;
    }
    p.playVideo();
    // Mobile browsers may refuse to start a video without a tap.
    const t = setTimeout(() => blocked.current?.(p.getPlayerState() !== window.YT!.PlayerState.PLAYING), 2000);
    return () => clearTimeout(t);
  }, [playing, ready]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-3xl border border-line bg-black [&_iframe]:h-full [&_iframe]:w-full">
      <div ref={host} className="h-full w-full" />
    </div>
  );
}
