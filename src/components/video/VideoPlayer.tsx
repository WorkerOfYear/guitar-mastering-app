import { useEffect, useRef, useState, type RefObject } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import type { PlayerControl } from "@/components/tab/TabPlayer";
import type { VideoLink } from "@/shared/types";
import { loadInstagramVideo } from "@/lib/tabFiles";
import { YouTubePlayer } from "./YouTubePlayer";

// The item's video, controlled from outside like the tab player: YouTube through its IFrame player,
// Instagram as an mp4 the server downloaded, in a plain <video>.

interface Props {
  /** The library item the video belongs to (Instagram videos are stored with it) */
  itemId: string;
  video: VideoLink;
  playing: boolean;
  onBlocked?: (blocked: boolean) => void;
  control?: RefObject<PlayerControl | null>;
}

export function VideoPlayer({ itemId, video, playing, onBlocked, control }: Props) {
  if (video.instagramId !== undefined)
    return <InstagramPlayer key={video.instagramId} itemId={itemId} code={video.instagramId} playing={playing} onBlocked={onBlocked} control={control} />;
  return <YouTubePlayer videoId={video.youtubeId} start={video.start} playing={playing} onBlocked={onBlocked} control={control} />;
}

function InstagramPlayer({ itemId, code, playing, onBlocked, control }: Omit<Props, "video"> & { code: string }) {
  const el = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;

  useEffect(() => {
    let u = "";
    let cancelled = false;
    loadInstagramVideo(itemId, code)
      .then((data) => {
        if (cancelled) return;
        u = URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
        setUrl(u);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [itemId, code]);

  useEffect(() => {
    if (control) control.current = { resume: () => void el.current?.play() };
  }, [control]);

  useEffect(() => {
    const v = el.current;
    if (!v || !url) return;
    if (!playing) {
      v.pause();
      return;
    }
    // Mobile browsers may refuse to start a video with sound without a tap: the session then offers one.
    v.play().then(
      () => blocked.current?.(false),
      () => blocked.current?.(true),
    );
  }, [playing, url]);

  if (error)
    return (
      <div className="space-y-2 rounded-3xl border border-line p-4 text-center text-sm">
        <p className="text-guide">Не удалось загрузить видео из Instagram: {error}</p>
        <a href={`https://www.instagram.com/reel/${code}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent">
          Открыть в Instagram <ExternalLink className="size-4" />
        </a>
      </div>
    );
  if (!url)
    return (
      <div className="mx-auto flex aspect-[9/16] max-h-[70vh] w-full max-w-xs flex-col items-center justify-center gap-2 rounded-3xl border border-line bg-black/80 text-sm text-white/70">
        <LoaderCircle className="size-6 animate-spin" />
        Загружаю видео из Instagram…
      </div>
    );
  return (
    <div className="flex justify-center">
      <video ref={el} src={url} playsInline controls loop preload="auto" className="max-h-[70vh] max-w-full rounded-3xl border border-line bg-black" />
    </div>
  );
}
