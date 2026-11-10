import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { stepRate } from "@/lib/videoControls";

const JUMPS = [-5, -2, 2, 5];

interface Props {
  rate: number;
  /** Speeds this video can play at */
  rates: number[];
  onRate: (rate: number) => void;
  /** Jump by this many seconds */
  onSeek: (delta: number) => void;
  disabled?: boolean;
}

/** The player's own bar under the picture: jumps of 2 and 5 seconds, and the speed. */
export function VideoBar({ rate, rates, onRate, onSeek, disabled }: Props) {
  const jump = (delta: number) => (
    <Button
      key={delta}
      variant="ghost"
      disabled={disabled}
      aria-label={`${delta < 0 ? "Назад" : "Вперёд"} на ${Math.abs(delta)} секунд${Math.abs(delta) === 2 ? "ы" : ""}`}
      onClick={() => onSeek(delta)}
      className="h-10 min-w-0 flex-1 px-0 text-sm font-semibold tabular-nums"
    >
      {delta < 0 ? "−" : "+"}
      {Math.abs(delta)}с
    </Button>
  );
  const slower = stepRate(rates, rate, -1);
  const faster = stepRate(rates, rate, 1);
  return (
    <div className="flex items-center gap-0.5 border-t border-line bg-surface px-1 py-1">
      {JUMPS.slice(0, 2).map(jump)}
      <div className="mx-0.5 flex shrink-0 items-center rounded-xl bg-surface-2/50">
        <Button variant="ghost" size="icon" disabled={disabled || slower === rate} aria-label="Медленнее" title="Медленнее" onClick={() => onRate(slower)} className="size-10">
          <Minus />
        </Button>
        <span aria-live="polite" className="w-11 text-center text-sm font-bold tabular-nums">
          {Math.round(rate * 100)}%
        </span>
        <Button variant="ghost" size="icon" disabled={disabled || faster === rate} aria-label="Быстрее" title="Быстрее" onClick={() => onRate(faster)} className="size-10">
          <Plus />
        </Button>
      </div>
      {JUMPS.slice(2).map(jump)}
    </div>
  );
}
