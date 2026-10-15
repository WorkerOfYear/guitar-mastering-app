import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { m as motion } from "motion/react";
import { Slider as SliderPrimitive } from "radix-ui";
import { Check, Minus, Play, Plus, Square, Volume2 } from "lucide-react";
import { Card, IconButton, Slider, Toggle } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { haptic } from "@/app/telegram";
import { previewClick, toggleMetronome } from "@/audio/metronome";
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

const SUBDIVISIONS: Subdivision[] = [1, 2, 3, 4, 6];
const SUB_SHORT: Record<Subdivision, string> = { 1: "♩", 2: "♫", 3: "3", 4: "16", 6: "6" };

function BeatDots() {
  const { beats, beat, accents } = useMetronome();
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-hidden>
      {Array.from({ length: beats }, (_, i) => {
        const on = beat === i;
        const color = accents.includes(i + 1) ? "var(--root)" : "var(--chord)";
        return (
          <motion.span
            key={i}
            className="size-3 rounded-full"
            animate={{ scale: on ? 1.35 : 1 }}
            transition={{ type: "spring", stiffness: 700, damping: 22 }}
            style={{ background: on ? color : "var(--surface-2)", boxShadow: on ? `0 0 12px ${color}` : undefined }}
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

// ---------- the metronome screen, laid out like metronom.us

const BASE = import.meta.env.BASE_URL;
const rhythmImage = (r: Rhythm, unit: 4 | 8) => `${BASE}metronome/r${unit}-${r.id}.png`;
/** Patterns shown on the site; the sextuplet is only used by the practice plan. */
const PICKABLE = RHYTHMS.filter((r) => r.id !== "x6");

const CIRCLE =
  "flex shrink-0 select-none items-center justify-center rounded-full border-2 border-line bg-surface-2 text-muted shadow-md outline-none [-webkit-tap-highlight-color:transparent] transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/60";
const SERIF = "font-['Noto_Serif',Georgia,serif]";

function RhythmImage({ rhythm, unit, className }: { rhythm: Rhythm; unit: 4 | 8; className?: string }) {
  return <img src={rhythmImage(rhythm, unit)} alt="" draggable={false} className={cn("pointer-events-none object-contain [:root[data-theme=light]_&]:invert", className)} />;
}

/**
 * One blink of a beat circle, fade-out included, is a fraction of the gap between two notes — so it follows
 * the tempo and the rhythm pattern (a sextuplet at 200 bpm blinks faster than a quarter at 60). 15–60 ms.
 */
function blink(bpm: number, grid: number) {
  const total = Math.min(60, Math.max(15, (60000 / bpm / grid) * 0.25));
  const hold = total * 0.4;
  return { hold, fade: total - hold };
}

function Beats() {
  const { beats, accents, running, note, bpm, rhythm } = useMetronome();
  const { hold, fade } = blink(bpm, rhythmById(rhythm).grid);
  const [lit, setLit] = useState(-1);
  // every sounding note lights the circle of its beat — only for an instant, then it goes dark again
  useEffect(() => {
    if (!running || note.beat < 0) return setLit(-1);
    setLit(note.beat);
    const t = setTimeout(() => setLit(-1), hold);
    return () => clearTimeout(t);
  }, [note.id, note.beat, running, hold]);
  const toggle = (n: number) => {
    haptic();
    const cur = useMetronome.getState().accents;
    useMetronome.setState({ accents: (cur.includes(n) ? cur.filter((a) => a !== n) : [...cur, n]).sort((x, y) => x - y) });
  };
  return (
    <div className="flex min-h-14 flex-wrap items-start justify-center gap-x-5 gap-y-1">
      {Array.from({ length: beats }, (_, i) => {
        const accented = accents.includes(i + 1);
        const color = accented ? "var(--root)" : "var(--chord)";
        const on = lit === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i + 1)}
            aria-pressed={accented}
            aria-label={`Доля ${i + 1}${accented ? ", акцент" : ""}`}
            className="flex w-8 flex-col items-center gap-0.5 pt-1 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span
              className="block size-5 rounded-full border bg-surface-2"
              style={{
                // only the rim lights up, no glow; the inside stays as it is
                borderColor: on ? color : "var(--border)",
                boxShadow: on ? `0 0 0 1px ${color}` : undefined,
                transition: on ? "none" : `box-shadow ${fade}ms linear, border-color ${fade}ms linear`,
              }}
            />
            <span className={cn("text-sm font-bold leading-none text-muted", !accented && "invisible")}>↑</span>
          </button>
        );
      })}
    </div>
  );
}

const HINT_BPMS = [20, 60, 100, 140, 180, 220, 260, 300];
const TICKS = Array.from({ length: (BPM_MAX - BPM_MIN) / 10 + 1 }, (_, i) => BPM_MIN + i * 10);
const THUMB = 36;
/** Where the centre of the thumb sits for `bpm` — the thumb never leaves the track, so it is inset by half its width. */
const thumbLeft = (bpm: number) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${(bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)})`;

/** Arrow keys that change the tempo — only shown where there is a keyboard. */
function KeyHint() {
  return (
    <div className="mb-6 flex justify-center opacity-30 max-[600px]:hidden" aria-hidden>
      {[-90, 180, 0, 90].map((deg) => (
        <img
          key={deg}
          src={`${BASE}metronome/hint-arrow.png`}
          alt=""
          draggable={false}
          className="mx-[5px] size-4 [:root[data-theme=light]_&]:invert"
          style={{ transform: `rotate(${deg}deg)` }}
        />
      ))}
    </div>
  );
}

function TempoSlider() {
  const bpm = useMetronome((s) => s.bpm);
  const running = useMetronome((s) => s.running);
  // the colours of the start-button ring, toned down towards the surface so the slider stays calm
  const calm = (c: string) => `color-mix(in oklab, ${c} 55%, var(--surface-2))`;
  const ring = running ? ["var(--guide)", "var(--root)"] : ["var(--accent)", "var(--chord)"];
  const tone = { "--s1": calm(ring[0]), "--s2": calm(ring[1]) } as CSSProperties;
  const up = useHoldRepeat(1);
  const down = useHoldRepeat(-1);
  return (
    <div className="mt-12">
      <KeyHint />
      <div className="flex items-center gap-4">
        <button type="button" aria-label="Темп −1" className={cn(CIRCLE, "size-10 touch-none")} {...down}>
          <Minus className="size-5" />
        </button>
        <SliderPrimitive.Root
          min={BPM_MIN}
          max={BPM_MAX}
          step={1}
          value={[bpm]}
          onValueChange={([v]) => useMetronome.setState({ bpm: v })}
          aria-label="Темп"
          className="relative flex h-9 min-w-0 flex-1 touch-none select-none items-center"
          style={tone}
        >
          <SliderPrimitive.Track className="relative h-1.5 grow rounded-full bg-surface-2">
            <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-[var(--s1)] to-[var(--s2)]" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block size-9 rounded-full border-[5px] border-transparent bg-[linear-gradient(var(--surface),var(--surface))_padding-box,linear-gradient(135deg,var(--s1),var(--s2))_border-box] shadow-md outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-105" />
        </SliderPrimitive.Root>
        <button type="button" aria-label="Темп +1" className={cn(CIRCLE, "size-10 touch-none")} {...up}>
          <Plus className="size-5" />
        </button>
      </div>
      {/* the ruler: same width and inset as the slider, so every mark sits under its own spot on the track */}
      <div className="mx-[56px] mt-2 text-xs font-medium text-muted" aria-hidden>
        <div className="relative h-8">
          {TICKS.map((v) => (
            <span key={v} className="absolute top-0 h-1.5 w-px -translate-x-1/2 bg-line" style={{ left: thumbLeft(v) }} />
          ))}
          {HINT_BPMS.map((v) => (
            <button
              key={v}
              type="button"
              tabIndex={-1}
              onClick={() => useMetronome.setState({ bpm: v })}
              className={cn("absolute top-2.5 -translate-x-1/2 tabular-nums", v % 120 !== 20 && v % 120 !== 60 && "max-[450px]:hidden")}
              style={{ left: thumbLeft(v) }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The big round start button: the tempo sits inside, the ring spins. */
function StartButton() {
  const { bpm, running } = useMetronome();
  return (
    <div className="relative mx-auto my-6 size-[180px] max-[360px]:size-[150px]">
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          haptic();
          toggleMetronome();
        }}
        aria-label={running ? "Остановить метроном" : "Запустить метроном"}
        className="absolute inset-0 select-none rounded-full shadow-[0_8px_30px_-8px_#0009] outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="absolute inset-0 animate-[spin_1.5s_linear_infinite] rounded-full bg-gradient-to-br from-[var(--guide)] to-[var(--root)]" />
        <span
          className={cn(
            "absolute inset-0 animate-[spin_3s_linear_infinite] rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--chord)] transition-opacity duration-500",
            running && "opacity-0",
          )}
        />
        <span className="absolute inset-[4%] flex flex-col items-center justify-center rounded-full bg-surface-2">
          <span
            className={cn(
              "-mt-6 bg-gradient-to-br bg-clip-text text-[60px] font-semibold leading-none tabular-nums text-transparent",
              running ? "from-[var(--guide)] to-[var(--root)]" : "from-[var(--accent)] to-[var(--chord)]",
            )}
          >
            {bpm}
          </span>
          <span className="absolute mt-[50px] text-sm text-muted">ударов в мин.</span>
          <img
            src={`${BASE}metronome/hint-space.png`}
            alt=""
            draggable={false}
            className="absolute mt-[100px] h-[17px] w-[60px] opacity-70 max-[600px]:hidden [:root[data-theme=light]_&]:invert"
          />
        </span>
      </motion.button>
    </div>
  );
}

function SheetTitle({ children }: { children: ReactNode }) {
  return (
    <>
      <DrawerTitle className="text-center text-base font-normal text-muted">{children}</DrawerTitle>
      <DrawerDescription className="sr-only">Выбор параметров метронома</DrawerDescription>
    </>
  );
}

const SHEET = "pb-0";

/** Time signature: numerals on a staff with − / +, and the usual ones underneath. */
function MeterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { beats, beatUnit, set } = useMetronome();
  const [b, setB] = useState(beats);
  const [u, setU] = useState<4 | 8>(beatUnit);
  useEffect(() => {
    if (open) {
      setB(beats);
      setU(beatUnit);
    }
  }, [open, beats, beatUnit]);
  const apply = (nb: number, nu: 4 | 8) => {
    haptic();
    set({ beats: nb, beatUnit: nu, accents: defaultAccents(nb, nu) });
    onClose();
  };
  const step = (disabled: boolean, onClick: () => void, icon: ReactNode, label: string) => (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex size-10 items-center justify-center rounded-full text-fg opacity-70 outline-none disabled:opacity-20 active:scale-95">
      {icon}
    </button>
  );
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className={SHEET}>
        <SheetTitle>Музыкальный размер</SheetTitle>
        <div className="relative my-4 flex h-52 items-center justify-center">
          <div className="absolute inset-x-0 top-6 h-40" aria-hidden>
            {[0, 25, 50, 75, 100].map((t) => (
              <div key={t} className="absolute h-0.5 w-full bg-fg/10" style={{ top: `calc(${t}% - 1px)` }} />
            ))}
          </div>
          <div className="relative flex flex-col items-center gap-0">
            {[
              { v: b, dec: () => setB(b - 1), inc: () => setB(b + 1), min: b <= BEATS_MIN, max: b >= BEATS_MAX, l: "Долей" },
              { v: u, dec: () => setU(4), inc: () => setU(8), min: u === 4, max: u === 8, l: "Длительность доли" },
            ].map((row) => (
              <div key={row.l} className="flex items-center">
                {step(row.min, row.dec, <Minus className="size-6" />, `${row.l}: меньше`)}
                <div className={cn(SERIF, "w-24 text-center text-[88px] leading-[0.85] text-fg tabular-nums")}>{row.v}</div>
                {step(row.max, row.inc, <Plus className="size-6" />, `${row.l}: больше`)}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center pb-4">
          <button type="button" onClick={() => apply(b, u)} className="rounded-[10px] bg-gradient-to-br from-[var(--accent)] to-[var(--chord)] p-0.5 outline-none">
            <span className="block rounded-[10px] bg-surface-2 px-8 pb-2 pt-1.5 text-fg">Ok</span>
          </button>
        </div>
        <div className="-mx-4 border-t border-line bg-surface-2/40 px-6 pb-[max(env(safe-area-inset-bottom),1rem)] pt-6">
          <div className="flex flex-wrap justify-center gap-3">
            {SIGNATURE_PRESETS.map(([pb, pu]) => {
              const active = pb === beats && pu === beatUnit;
              return (
                <button
                  key={`${pb}/${pu}`}
                  type="button"
                  onClick={() => apply(pb, pu)}
                  className={cn(SERIF, "flex size-14 flex-col items-center justify-center rounded-full border text-lg font-bold leading-none outline-none", active ? "border-2 border-accent text-fg" : "border-line text-muted hover:opacity-80")}
                >
                  <span>{pb}</span>
                  <span className="-mt-0.5">{pu}</span>
                </button>
              );
            })}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Rhythm patterns: a grid of round buttons with notation. */
function RhythmSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { rhythm, beatUnit, set } = useMetronome();
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className={SHEET}>
        <SheetTitle>Ритмический рисунок</SheetTitle>
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 overflow-y-auto pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2" role="radiogroup" aria-label="Ритмический рисунок">
          {PICKABLE.map((r) => {
            const active = r.id === rhythm;
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
                  set({ rhythm: r.id });
                  onClose();
                }}
                className={cn(CIRCLE, "m-2 size-[70px] min-[450px]:size-20", active && "border-accent text-accent")}
              >
                <RhythmImage rhythm={r} unit={beatUnit} className={cn("size-full p-3.5", active ? "opacity-100" : "opacity-70")} />
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Full metronome: tempo, meter, accents, rhythm pattern. */
export function MetronomePanel() {
  const m = useMetronome();
  const rhythm = rhythmById(m.rhythm);
  const [sheet, setSheet] = useState<"meter" | "rhythm" | null>(null);
  const picked = PICKABLE.includes(rhythm);
  return (
    <div className="space-y-4">
      <section className="select-none overflow-hidden rounded-3xl border border-line bg-surface px-5 pb-6 pt-6">
        <div className="flex justify-center gap-10">
          <div className="flex flex-col items-center">
            <span className="mb-2.5 text-xs text-muted">Размер</span>
            <button type="button" onClick={() => setSheet("meter")} aria-label={`Размер ${m.beats}/${m.beatUnit}`} className={cn(CIRCLE, SERIF, "size-[60px] flex-col text-lg font-bold leading-none")}>
              <span>{m.beats}</span>
              <span className="-mt-0.5">{m.beatUnit}</span>
            </button>
          </div>
          <div className="flex flex-col items-center">
            <span className="mb-2.5 text-xs text-muted">Рисунок</span>
            <button type="button" onClick={() => setSheet("rhythm")} aria-label={`Рисунок: ${rhythm.name}`} className={cn(CIRCLE, "size-[60px]")}>
              {picked ? <RhythmImage rhythm={rhythm} unit={m.beatUnit} className="size-full p-3 opacity-50" /> : <span className="text-sm">{SUB_SHORT[6]}</span>}
            </button>
          </div>
        </div>

        <div className="mt-6">
          <Beats />
        </div>

        <StartButton />

        <TempoSlider />
      </section>

      <MeterSheet open={sheet === "meter"} onClose={() => setSheet(null)} />
      <RhythmSheet open={sheet === "rhythm"} onClose={() => setSheet(null)} />
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">{children}</div>;
}

/** Metronome settings: click sound, volume, screen flash. */
export function SettingsPanel() {
  const { click, volume, flash, set } = useMetronome();
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
        <div className="border-t border-line/60">
          <Toggle label="Вспышка экрана на долю" checked={flash} onChange={(f) => set({ flash: f })} />
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
        <BeatDots />
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
