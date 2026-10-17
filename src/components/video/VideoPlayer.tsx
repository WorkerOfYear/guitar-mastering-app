import type { RefObject } from "react";
import type { PlayerControl } from "@/components/tab/TabPlayer";
import type { VideoLink } from "@/shared/types";
import { YouTubePlayer } from "./YouTubePlayer";

// The item's video: YouTube is controlled like the tab player; Instagram's embed can't be,
// so it is started with a tap inside it.

interface Props {
  video: VideoLink;
  playing: boolean;
  onBlocked?: (blocked: boolean) => void;
  control?: RefObject<PlayerControl | null>;
}

export function VideoPlayer({ video, playing, onBlocked, control }: Props) {
  if (video.instagramId !== undefined) return <InstagramPlayer id={video.instagramId} hint={playing} />;
  return <YouTubePlayer videoId={video.youtubeId} start={video.start} playing={playing} onBlocked={onBlocked} control={control} />;
}

function InstagramPlayer({ id, hint }: { id: string; hint: boolean }) {
  return (
    <div className="space-y-2">
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-white">
        <iframe
          src={`https://www.instagram.com/p/${id}/embed/`}
          title="Видео Instagram"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="block h-[560px] w-full border-0"
        />
      </div>
      {hint && <p className="px-1 text-center text-xs text-muted">Видео из Instagram запускается касанием по нему</p>}
    </div>
  );
}
