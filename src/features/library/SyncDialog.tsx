import { useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import TabPlayer, { type PlayerControl } from "@/components/tab/TabPlayer";
import { laneMaker } from "@/lib/syncLane";
import type { Item } from "@/shared/types";
import { AudioSync } from "./AudioSync";

// Syncing the recording with the tab, in a window of its own: the notes on top, the recording's timeline under
// them with the tab's notes laid on it. Playing moves the cursor in the notes along with the recording; the
// arrow keys work at once (bar to bar); a bar clicked in the notes is where the timeline goes.
// Loaded only when opened: it parses the tab a second time.

// The notes follow the recording this often while it plays, ms (scrolling them every frame is heavy).
const FOLLOW_MS = 120;

export default function SyncDialog({
  open,
  onOpenChange,
  item,
  audio,
  tab,
  track,
  sections,
  bars,
  barMs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Item;
  audio: ArrayBuffer;
  tab: ArrayBuffer;
  track: number;
  sections: { title: string; bar: number }[];
  bars: number;
  barMs: number[];
}) {
  const control = useRef<PlayerControl | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const unrepeat = item.audioUnrepeat ?? [];
  const lane = useMemo(() => laneMaker(tab, unrepeat), [tab, unrepeat.join(",")]);
  const shown = useRef(0);
  // A bar clicked in the notes: the timeline goes there.
  const [jump, setJump] = useState<{ bar: number; n: number }>();
  const show = (ms: number, now = false) => {
    const t = performance.now();
    if (!now && t - shown.current < FOLLOW_MS) return;
    shown.current = t;
    control.current?.showTime?.(ms);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          ref={content}
          tabIndex={-1}
          aria-describedby={undefined}
          // Focus the window, not its first button: space plays here, and on «Закрыть» it would close it.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            content.current?.focus();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-bg text-fg outline-none sm:inset-4 sm:mx-auto sm:max-w-5xl sm:rounded-3xl sm:border sm:border-line"
        >
          <div className="flex items-center gap-2 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.75rem)]">
            <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">Синхронизация · {item.title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Закрыть">
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
            {/* Only a cursor here: the recording below plays, the tab follows it. */}
            <TabPlayer
              file={tab}
              audio={null}
              sync={item.audioSync}
              unrepeat={item.audioUnrepeat}
              skip={item.audioSkip}
              playing={false}
              track={track}
              height="32dvh"
              control={control}
              onBarClick={(bar) => setJump((j) => ({ bar, n: (j?.n ?? 0) + 1 }))}
            />
            <AudioSync
              item={item}
              audio={audio}
              tab={tab}
              sections={sections}
              bars={bars}
              barMs={barMs}
              lane={lane}
              onPreview={(ms) => show(ms, true)}
              onTime={(ms) => show(ms)}
              jump={jump}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
