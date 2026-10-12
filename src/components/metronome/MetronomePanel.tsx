import { m as motion } from "motion/react";
import { Hand, Minus, Play, Plus, Square, Volume2 } from "lucide-react";
import { Card, Chip, IconButton, ScrollRow, Slider, Toggle, NumberField } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { tapTempo, toggleMetronome } from "@/audio/metronome";
import { cn } from "@/lib/utils";
import { BPM_MAX, BPM_MIN, clampBpm, useMetronome } from "@/store/metronome";
import { SUBDIVISION_META, type Subdivision } from "@/shared/types";

export { NumberField } from "@/components/ui";

const SUBDIVISIONS: Subdivision[] = [1, 2, 3, 4, 6];
const SUB_SHORT: Record<Subdivision, string> = { 1: "♩", 2: "♫", 3: "3", 4: "16", 6: "6" };

function BeatDots({ size = "md" }: { size?: "sm" | "md" }) {
  const { beats, beat, accent } = useMetronome();
  return (
    <div className="flex justify-center gap-2" aria-hidden>
      {Array.from({ length: beats }, (_, i) => {
        const on = beat === i;
        return (
          <motion.span
            key={i}
            className={cn("rounded-full", size === "sm" ? "size-3" : "size-4")}
            animate={{ scale: on ? 1.35 : 1 }}
            transition={{ type: "spring", stiffness: 700, damping: 22 }}
            style={{
              background: on ? (i === 0 && accent ? "var(--root)" : "var(--chord)") : "var(--surface-2)",
              boxShadow: on ? `0 0 12px ${i === 0 && accent ? "var(--root)" : "var(--chord)"}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function PlayButton({ big }: { big?: boolean }) {
  const running = useMetronome((s) => s.running);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        haptic();
        toggleMetronome();
      }}
      aria-label={running ? "Остановить метроном" : "Запустить метроном"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-on-accent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
        big ? "size-20" : "size-14",
        running ? "bg-guide shadow-[0_8px_24px_-8px_var(--guide)]" : "bg-accent glow-accent",
      )}
    >
      {running ? (
        <Square className={big ? "size-7" : "size-5"} fill="currentColor" />
      ) : (
        <Play className={cn(big ? "size-8" : "size-6", "translate-x-0.5")} fill="currentColor" />
      )}
    </motion.button>
  );
}

/** Tempo that pops a little on every change. */
function BpmNumber({ bpm, className }: { bpm: number; className?: string }) {
  return (
    <motion.div
      key={bpm}
      initial={{ scale: 0.94, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn("font-bold tabular-nums leading-none tracking-tight", className)}
    >
      {bpm}
    </motion.div>
  );
}

/** Full metronome: tempo, tap, meter, subdivision, speed trainer. */
export function MetronomePanel() {
  const m = useMetronome();
  const nudge = (d: number) => m.set({ bpm: clampBpm(m.bpm + d) });
  return (
    <div className="space-y-4">
      <Card className="space-y-5 py-6">
        <div className="text-center">
          <BpmNumber bpm={m.bpm} className="text-8xl" />
          <div className="mt-2 text-sm text-muted">bpm · {SUBDIVISION_META[m.subdivision]}</div>
        </div>
        <BeatDots />
        <div className="flex items-center justify-center gap-2">
          <IconButton label="−5" onClick={() => nudge(-5)}>
            −5
          </IconButton>
          <IconButton label="−1" onClick={() => nudge(-1)}>
            <Minus />
          </IconButton>
          <PlayButton big />
          <IconButton label="+1" onClick={() => nudge(1)}>
            <Plus />
          </IconButton>
          <IconButton label="+5" onClick={() => nudge(5)}>
            +5
          </IconButton>
        </div>
        <Slider min={BPM_MIN} max={BPM_MAX} value={[m.bpm]} onValueChange={([bpm]) => m.set({ bpm })} aria-label="Темп" />
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            haptic();
            tapTempo();
          }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface-2/50 text-base font-semibold"
        >
          <Hand className="size-5 text-muted" />
          Tap — отстучи темп
        </motion.button>
      </Card>

      <div>
        <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">Доли в такте</div>
        <ScrollRow>
          {[2, 3, 4, 5, 6, 7].map((b) => (
            <Chip key={b} active={m.beats === b} onClick={() => m.set({ beats: b })} className="min-w-12">
              {b}
            </Chip>
          ))}
        </ScrollRow>
      </div>
      <div>
        <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">Деление доли</div>
        <ScrollRow>
          {SUBDIVISIONS.map((s) => (
            <Chip key={s} active={m.subdivision === s} sub={SUBDIVISION_META[s]} onClick={() => m.set({ subdivision: s })}>
              {SUB_SHORT[s]}
            </Chip>
          ))}
        </ScrollRow>
      </div>

      <Card className="divide-y divide-line/60 py-1">
        <Toggle label="Акцент на первую долю" checked={m.accent} onChange={(accent) => m.set({ accent })} />
        <Toggle label="Вспышка экрана на долю" checked={m.flash} onChange={(flash) => m.set({ flash })} />
        <div>
          <Toggle
            label="Speed trainer"
            hint="Темп растёт сам каждые N тактов"
            checked={m.trainer.enabled}
            onChange={(enabled) => m.set({ trainer: { ...m.trainer, enabled } })}
          />
          {m.trainer.enabled && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="grid grid-cols-3 gap-2 overflow-hidden pb-3">
              <NumberField label="+bpm" value={m.trainer.step} onChange={(step) => m.set({ trainer: { ...m.trainer, step } })} />
              <NumberField label="каждые N тактов" value={m.trainer.everyBars} onChange={(everyBars) => m.set({ trainer: { ...m.trainer, everyBars } })} />
              <NumberField label="до bpm" value={m.trainer.target} onChange={(target) => m.set({ trainer: { ...m.trainer, target } })} />
            </motion.div>
          )}
        </div>
        <div className="flex items-center gap-3 py-3 text-sm">
          <Volume2 className="size-5 shrink-0 text-muted" aria-hidden />
          <span className="shrink-0">Громкость</span>
          <Slider min={0.1} max={1} step={0.05} value={[m.volume]} onValueChange={([volume]) => m.set({ volume })} aria-label="Громкость" />
        </div>
      </Card>
    </div>
  );
}

/** One-row metronome for the session screen. */
export function CompactMetronome() {
  const m = useMetronome();
  const nudge = (d: number) => m.set({ bpm: clampBpm(m.bpm + d) });
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <IconButton label="−5" onClick={() => nudge(-5)}>
          −5
        </IconButton>
        <IconButton label="−1" onClick={() => nudge(-1)}>
          <Minus />
        </IconButton>
        <div className="flex-1 text-center">
          <BpmNumber bpm={m.bpm} className="text-3xl" />
          <div className="mt-0.5 text-[11px] text-muted">{SUBDIVISION_META[m.subdivision]}</div>
        </div>
        <IconButton label="+1" onClick={() => nudge(1)}>
          <Plus />
        </IconButton>
        <IconButton label="+5" onClick={() => nudge(5)}>
          +5
        </IconButton>
        <PlayButton />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <BeatDots size="sm" />
        <div className="flex gap-1 rounded-xl bg-surface-2 p-0.5">
          {SUBDIVISIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={SUBDIVISION_META[s]}
              onClick={() => {
                haptic();
                m.set({ subdivision: s });
              }}
              className={cn(
                "h-8 min-w-8 rounded-lg px-1.5 text-xs font-semibold transition-colors",
                m.subdivision === s ? "bg-accent text-on-accent" : "text-muted",
              )}
            >
              {SUB_SHORT[s]}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Full-screen flash on each beat — visible from the corner of the eye. */
export function BeatFlash() {
  const { flash, running, beat, accent } = useMetronome();
  if (!flash || !running || beat < 0) return null;
  return (
    <div
      key={`${beat}-${Date.now()}`}
      className="pointer-events-none fixed inset-0 z-30 animate-[flash_160ms_ease-out_forwards]"
      style={{ background: beat === 0 && accent ? "var(--root)" : "var(--chord)" }}
    />
  );
}
