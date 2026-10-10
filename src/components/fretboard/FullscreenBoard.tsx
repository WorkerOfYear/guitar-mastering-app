import { useEffect, useState, type ComponentProps } from "react";
import { Fretboard, fretboardSize } from "@/components/fretboard/Fretboard";
import { IconButton, Segmented } from "@/components/ui";
import type { LabelMode } from "@/store/settings";

type BoardProps = Omit<ComponentProps<typeof Fretboard>, "zoom">;

interface Props {
  title: string;
  board: BoardProps;
  positionLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onTogglePosition: () => void;
  labelMode: LabelMode;
  labelOptions: { value: LabelMode; label: string }[];
  onLabelMode: (v: LabelMode) => void;
  onClose: () => void;
}

const CONTROLS_HEIGHT = 112;

/** The board alone, scaled to fit the screen — for the phone on a music stand, best in landscape. */
export function FullscreenBoard({ title, board, positionLabel, onPrev, onNext, onTogglePosition, labelMode, labelOptions, onLabelMode, onClose }: Props) {
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const size = fretboardSize(board.frets);
  // Landscape: the whole neck fits the screen. Portrait: fit the height and scroll sideways.
  const fitHeight = (viewport.h - CONTROLS_HEIGHT) / size.height;
  const fitWidth = viewport.w / size.width;
  const zoom = Math.max(0.6, viewport.w > viewport.h ? Math.min(fitHeight, fitWidth) : Math.min(fitHeight, 1.4));

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1 truncate font-bold">{title}</div>
        <IconButton label="Закрыть" onClick={onClose}>
          ✕
        </IconButton>
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <div className="w-full">
          <Fretboard {...board} zoom={zoom} />
        </div>
        {viewport.h > viewport.w && (
          <p className="mt-4 px-4 text-center text-sm text-muted">Поверни телефон — гриф поместится целиком</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <IconButton label="Предыдущая позиция" onClick={onPrev}>
          ‹
        </IconButton>
        <button type="button" onClick={onTogglePosition} className="h-11 shrink-0 rounded-2xl bg-surface-2 px-4 text-sm font-semibold">
          {positionLabel}
        </button>
        <IconButton label="Следующая позиция" onClick={onNext}>
          ›
        </IconButton>
        <div className="min-w-0 flex-1 [@media(orientation:portrait)]:basis-full">
          <Segmented size="sm" value={labelMode} onChange={onLabelMode} options={labelOptions} />
        </div>
      </div>
    </div>
  );
}
