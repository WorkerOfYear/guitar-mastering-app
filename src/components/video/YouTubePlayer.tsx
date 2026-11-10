import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerControl } from "@/components/tab/TabPlayer";
import { seekTarget } from "@/lib/videoControls";
import { VideoBar } from "./VideoBar";

// YouTube IFrame Player, controlled from outside like the tab player.

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
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
  /** On screen; going off it pauses the video, which keeps its place */
  active?: boolean;
  onBlocked?: (blocked: boolean) => void;
  control?: RefObject<PlayerControl | null>;
}

export function YouTubePlayer({ videoId, start = 0, playing, active = true, onBlocked, control }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [rate, setRate] = useState(1);
  const [rates, setRates] = useState([1]);
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
        events: {
          onReady: () => {
            if (cancelled) return;
            setRates(player.current?.getAvailablePlaybackRates() ?? [1]);
            setRate(player.current?.getPlaybackRate() ?? 1);
            setReady(true);
          },
          // Also when the speed is changed from YouTube's own menu.
          onPlaybackRateChange: (e: { data: number }) => setRate(e.data),
        },
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

  useEffect(() => {
    if (ready && !active) player.current?.pauseVideo();
  }, [active, ready]);

  const seek = (delta: number) => {
    const p = player.current;
    if (p) p.seekTo(seekTarget(p.getCurrentTime(), delta, p.getDuration()), true);
  };

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-line bg-black">
      <div className="aspect-video w-full [&_iframe]:h-full [&_iframe]:w-full">
        <div ref={host} className="h-full w-full" />
      </div>
      <VideoBar rate={rate} rates={rates} onRate={(r) => player.current?.setPlaybackRate(r)} onSeek={seek} disabled={!ready} />
    </div>
  );
}
