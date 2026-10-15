import { useEffect, useRef, type ReactNode } from "react";
import { m as motion } from "motion/react";
import { Check, Hand, Minus, Play, Plus, Square, Volume2 } from "lucide-react";
import { Button, Card, Chip, IconButton, ScrollRow, Segmented, Slider, Toggle, NumberField } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { previewClick, tapTempo, toggleMetronome } from "@/audio/metronome";
import { CLICKS } from "@/audio/clicks";
import {
  BEATS_MAX,
  BEATS_MIN,
  RHYTHMS,
  SIGNATURE_PRESETS,
  defaultAccents,
  rhythmById,
  rhythmForSubdivision,
  type Rhythm,
} from "@/audio/rhythms";
import { cn } from "@/lib/utils";
import { BPM_MAX, BPM_MIN, clampBpm, useMetronome } from "@/store/metronome";
import type { Subdivision } from "@/shared/types";

export { NumberField } from "@/components/ui";

function BeatDots({ size = "md", interactive }: { size?: "sm" | "md"; interactive?: boolean }) {
  const { beats, beat, accents } = useMetronome();
  const toggleAccent = (n: number) => {
    haptic();
    const { accents: cur, set } = useMetronome.getState();
    set({ accents: (cur.includes(n) ? cur.filter((a) => a !== n) : [...cur, n]).sort((x, y) => x - y) });
  };
  return (
    <div className={cn("flex flex-wrap justify-center", size === "sm" ? "gap-2" : "gap-3")} aria-hidden={!interactive}>
      {Array.from({ length: beats }, (_, i) => {
        const on = beat === i;
        const accented = accents.includes(i + 1);
        const color = accented ? "var(--root)" : "var(--chord)";
        const dot = (
          <motion.span
            className={cn("block rounded-full", size === "sm" ? "size-3" : "size-5", accented && !on && "ring-2 ring-offset-2 ring-offset-surface")}
            animate={{ scale: on ? 1.35 : 1 }}
            transition={{ type: "spring", stiffness: 700, damping: 22 }}
            style={{
              background: on ? color : "var(--surface-2)",
              boxShadow: on ? `0 0 12px ${color}` : undefined,
              // the ring takes the accent colour; without an accent there is none
              ["--tw-ring-color" as string]: accented ? "var(--root)" : undefined,
            }}
          />
        );
        return interactive ? (
          <button
            key={i}
            type="button"
            onClick={() => toggleAccent(i + 1)}
            aria-pressed={accented}
            aria-label={`Доля ${i + 1}: акцент ${accented ? "включён" : "выключен"}`}
            className="flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {dot}
          </button>
        ) : (
          <span key={i}>{dot}</span>
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

const SUBDIVISIONS: Subdivision[] = [1, 2, 3, 4, 6];
const SUB_SHORT: Record<Subdivision, string> = { 1: "♩", 2: "♫", 3: "3", 4: "16", 6: "6" };

const nudge = (d: number) => {
  const { bpm, set } = useMetronome.getState();
  set({ bpm: clampBpm(bpm + d) });
};

/** Press and hold to keep changing the tempo, faster the longer you hold (like the arrows on metronom.us). */
function useHoldRepeat(delta: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const loop = (delay: number) => {
    nudge(delta);
    timer.current = setTimeout(() => loop(Math.max(50, delay - 50)), delay);
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      haptic();
      stop();
      loop(400);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // pointer clicks are handled above; Enter/Space from the keyboard step once
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) nudge(delta);
    },
  };
}

function HoldButton({ delta, children }: { delta: number; children: ReactNode }) {
  const hold = useHoldRepeat(delta);
  return (
    <Button variant="secondary" size="icon" aria-label={delta > 0 ? `+${delta}` : `−${-delta}`} className="min-w-11 w-auto px-3 select-none touch-none" {...hold}>
      {children}
    </Button>
  );
}

/** Space — start/stop, arrows — tempo ±1 (Shift: ±5). Use on the metronome page. */
export function useMetronomeKeys() {
  useEffect(() => {
    const ignore = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || el.getAttribute("role") === "slider");
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || ignore(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) toggleMetronome();
      } else if (e.code.startsWith("Arrow")) {
        e.preventDefault();
        nudge((e.code === "ArrowUp" || e.code === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 5 : 1));
      }
    };
    // a focused button would otherwise "click" on Space release
    const up = (e: KeyboardEvent) => e.code === "Space" && !ignore(e.target) && e.preventDefault();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
}

/** The beats of a rhythm as a strip: tall bar — sounds, short — rest. */
function RhythmGlyph({ rhythm }: { rhythm: Rhythm }) {
  return (
    <span className="flex h-6 items-end gap-0.5" aria-hidden>
      {Array.from({ length: rhythm.grid }, (_, i) => (
        <span key={i} className={cn("w-1.5 rounded-sm bg-current", rhythm.play.includes(i + 1) ? "h-6" : "h-1.5 opacity-30")} />
      ))}
    </span>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">{children}</div>;
}

/** Full metronome: tempo, tap, meter, accents, rhythm pattern, speed trainer. */
export function MetronomePanel() {
  const m = useMetronome();
  const rhythm = rhythmById(m.rhythm);
  const setMeter = (beats: number, beatUnit: 4 | 8) => m.set({ beats, beatUnit, accents: defaultAccents(beats, beatUnit) });
  return (
    <div className="space-y-4">
      <Card className="space-y-5 py-6">
        <div className="text-center">
          <BpmNumber bpm={m.bpm} className="text-8xl" />
          <div className="mt-2 text-sm text-muted">
            ударов в минуту · {m.beats}/{m.beatUnit}
          </div>
        </div>
        <BeatDots interactive />
        <p className="-mt-2 text-center text-xs text-muted">Нажми на долю, чтобы выделить её акцентом</p>
        <div className="flex items-center justify-center gap-2">
          <IconButton label="−5" onClick={() => nudge(-5)}>
            −5
          </IconButton>
          <HoldButton delta={-1}>
            <Minus />
          </HoldButton>
          <PlayButton big />
          <HoldButton delta={1}>
            <Plus />
          </HoldButton>
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
        <p className="text-center text-xs text-muted">Пробел — старт/стоп · стрелки — темп ±1 (Shift — ±5)</p>
      </Card>

      <div>
        <Label>Размер</Label>
        <Card className="space-y-3 p-3">
          <div className="flex items-center gap-3">
            <div className="w-20 text-center text-3xl font-bold tabular-nums">
              {m.beats}/{m.beatUnit}
            </div>
            <IconButton label="Меньше долей" disabled={m.beats <= BEATS_MIN} onClick={() => m.set({ beats: m.beats - 1, accents: m.accents.filter((a) => a < m.beats) })}>
              <Minus />
            </IconButton>
            <IconButton label="Больше долей" disabled={m.beats >= BEATS_MAX} onClick={() => m.set({ beats: m.beats + 1 })}>
              <Plus />
            </IconButton>
            <Segmented
              className="ml-auto"
              size="sm"
              value={String(m.beatUnit) as "4" | "8"}
              options={[
                { value: "4", label: "¼" },
                { value: "8", label: "⅛" },
              ]}
              onChange={(u) => setMeter(m.beats, u === "8" ? 8 : 4)}
            />
          </div>
          <ScrollRow>
            {SIGNATURE_PRESETS.map(([b, u]) => (
              <Chip key={`${b}/${u}`} active={m.beats === b && m.beatUnit === u} onClick={() => setMeter(b, u)} className="min-w-14">
                {b}/{u}
              </Chip>
            ))}
          </ScrollRow>
        </Card>
      </div>

      <div>
        <Label>Рисунок доли · {rhythm.name}</Label>
        <Card className="p-3">
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Ритмический рисунок">
            {RHYTHMS.map((r) => {
              const active = r.id === m.rhythm;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={r.name}
                  title={r.name}
                  onClick={() => {
                    haptic();
                    m.set({ rhythm: r.id });
                  }}
                  className={cn(
                    "flex h-14 items-center justify-center rounded-2xl border outline-none transition-[background-color,border-color,transform] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/60",
                    active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:bg-surface-2",
                  )}
                >
                  <RhythmGlyph rhythm={r} />
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted">Высокая полоска — звучит, низкая — пауза</p>
        </Card>
      </div>

      <Card className="divide-y divide-line/60 py-1">
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
      </Card>
    </div>
  );
}

/** Click sound and volume. */
export function SoundPanel() {
  const { click, volume, set } = useMetronome();
  return (
    <div className="space-y-4">
      <div>
        <Label>Звук клика</Label>
        <Card className="divide-y divide-line/60 p-0">
          {CLICKS.map((c) => {
            const active = c.id === click;
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    haptic();
                    set({ click: c.id });
                    previewClick(c.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", active ? "border-accent bg-accent text-on-accent" : "border-line")}>
                    {active && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{c.name}</span>
                    <span className="block text-xs text-muted">{c.hint}</span>
                  </span>
                </button>
                <IconButton label={`Послушать: ${c.name}`} onClick={() => previewClick(c.id)}>
                  <Play className="size-4" fill="currentColor" />
                </IconButton>
                <IconButton label={`Акцент: ${c.name}`} onClick={() => previewClick(c.id, "accent")} className="text-xs font-bold">
                  A
                </IconButton>
              </div>
            );
          })}
        </Card>
        <p className="px-1 pt-2 text-xs text-muted">▶ — обычная доля, A — акцентная. Выбор запоминается и звучит в сессии тоже.</p>
      </div>
      <Card className="py-1">
        <div className="flex items-center gap-3 py-3 text-sm">
          <Volume2 className="size-5 shrink-0 text-muted" aria-hidden />
          <span className="shrink-0">Громкость</span>
          <Slider min={0.1} max={1} step={0.05} value={[volume]} onValueChange={([v]) => set({ volume: v })} onValueCommit={() => previewClick(click)} aria-label="Громкость" />
        </div>
      </Card>
    </div>
  );
}

/** One-row metronome for the session screen. */
export function CompactMetronome() {
  const m = useMetronome();
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
          <div className="mt-0.5 text-[11px] text-muted">{rhythmById(m.rhythm).name}</div>
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
              aria-label={rhythmById(rhythmForSubdivision(s)).name}
              onClick={() => {
                haptic();
                m.set({ rhythm: rhythmForSubdivision(s) });
              }}
              className={cn(
                "h-8 min-w-8 rounded-lg px-1.5 text-xs font-semibold transition-colors",
                m.rhythm === rhythmForSubdivision(s) ? "bg-accent text-on-accent" : "text-muted",
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
  const { flash, running, beat, accents } = useMetronome();
  if (!flash || !running || beat < 0) return null;
  return (
    <div
      key={`${beat}-${Date.now()}`}
      className="pointer-events-none fixed inset-0 z-30 animate-[flash_160ms_ease-out_forwards]"
      style={{ background: accents.includes(beat + 1) ? "var(--root)" : "var(--chord)" }}
    />
  );
}
