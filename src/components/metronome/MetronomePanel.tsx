import { Chip, IconButton, ScrollRow, Toggle } from "@/components/ui";
import { tapTempo, toggleMetronome } from "@/audio/metronome";
import { BPM_MAX, BPM_MIN, clampBpm, useMetronome } from "@/store/metronome";
import { SUBDIVISION_META, type Subdivision } from "@/shared/types";

const SUBDIVISIONS: Subdivision[] = [1, 2, 3, 4, 6];
const SUB_SHORT: Record<Subdivision, string> = { 1: "♩", 2: "♫", 3: "3", 4: "16", 6: "6" };

function BeatDots() {
  const { beats, beat, accent } = useMetronome();
  return (
    <div className="flex justify-center gap-2" aria-hidden>
      {Array.from({ length: beats }, (_, i) => (
        <span
          key={i}
          className="h-3.5 w-3.5 rounded-full transition-colors duration-75"
          style={{ background: beat === i ? (i === 0 && accent ? "var(--root)" : "var(--chord)") : "var(--surface-2)" }}
        />
      ))}
    </div>
  );
}

function PlayButton({ big }: { big?: boolean }) {
  const running = useMetronome((s) => s.running);
  return (
    <button
      type="button"
      onClick={toggleMetronome}
      aria-label={running ? "Остановить метроном" : "Запустить метроном"}
      className={`flex items-center justify-center rounded-full font-bold ${big ? "h-20 w-20 text-3xl" : "h-14 w-14 text-xl"} ${
        running ? "bg-guide text-on-accent" : "bg-accent text-on-accent"
      }`}
    >
      {running ? "■" : "▶"}
    </button>
  );
}

/** Full metronome: tempo, tap, meter, subdivision, speed trainer. */
export function MetronomePanel() {
  const m = useMetronome();
  const nudge = (d: number) => m.set({ bpm: clampBpm(m.bpm + d) });
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-7xl font-bold tabular-nums leading-none">{m.bpm}</div>
        <div className="mt-1 text-sm text-muted">bpm · {SUBDIVISION_META[m.subdivision]}</div>
      </div>
      <BeatDots />
      <div className="flex items-center justify-center gap-2">
        <IconButton label="−5" onClick={() => nudge(-5)}>−5</IconButton>
        <IconButton label="−1" onClick={() => nudge(-1)}>−1</IconButton>
        <PlayButton big />
        <IconButton label="+1" onClick={() => nudge(1)}>+1</IconButton>
        <IconButton label="+5" onClick={() => nudge(5)}>+5</IconButton>
      </div>
      <input
        type="range"
        min={BPM_MIN}
        max={BPM_MAX}
        value={m.bpm}
        onChange={(e) => m.set({ bpm: Number(e.target.value) })}
        className="w-full accent-[var(--accent)]"
        aria-label="Темп"
      />
      <button type="button" onClick={tapTempo} className="h-14 w-full rounded-2xl bg-surface-2 text-base font-semibold active:scale-[0.98]">
        Tap — отстучи темп
      </button>

      <div>
        <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Доли в такте</div>
        <ScrollRow>
          {[2, 3, 4, 5, 6, 7].map((b) => (
            <Chip key={b} active={m.beats === b} onClick={() => m.set({ beats: b })}>
              {b}
            </Chip>
          ))}
        </ScrollRow>
      </div>
      <div>
        <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Деление доли</div>
        <ScrollRow>
          {SUBDIVISIONS.map((s) => (
            <Chip key={s} active={m.subdivision === s} sub={SUBDIVISION_META[s]} onClick={() => m.set({ subdivision: s })}>
              {SUB_SHORT[s]}
            </Chip>
          ))}
        </ScrollRow>
      </div>

      <div className="rounded-3xl border border-line bg-surface px-3 py-1">
        <Toggle label="Акцент на первую долю" checked={m.accent} onChange={(accent) => m.set({ accent })} />
        <Toggle label="Вспышка экрана на долю" checked={m.flash} onChange={(flash) => m.set({ flash })} />
        <Toggle label="Speed trainer" checked={m.trainer.enabled} onChange={(enabled) => m.set({ trainer: { ...m.trainer, enabled } })} />
        {m.trainer.enabled && (
          <div className="grid grid-cols-3 gap-2 pb-3">
            <NumberField label="+bpm" value={m.trainer.step} onChange={(step) => m.set({ trainer: { ...m.trainer, step } })} />
            <NumberField label="каждые N тактов" value={m.trainer.everyBars} onChange={(everyBars) => m.set({ trainer: { ...m.trainer, everyBars } })} />
            <NumberField label="до bpm" value={m.trainer.target} onChange={(target) => m.set({ trainer: { ...m.trainer, target } })} />
          </div>
        )}
        <label className="flex items-center gap-3 py-2.5 text-sm">
          Громкость
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={m.volume}
            onChange={(e) => m.set({ volume: Number(e.target.value) })}
            className="flex-1 accent-[var(--accent)]"
          />
        </label>
      </div>
    </div>
  );
}

export function NumberField({ label, value, onChange, min = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min) onChange(v);
        }}
        className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-base text-fg"
      />
    </label>
  );
}

/** One-row metronome for the session screen. */
export function CompactMetronome() {
  const m = useMetronome();
  const nudge = (d: number) => m.set({ bpm: clampBpm(m.bpm + d) });
  return (
    <div className="rounded-3xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <IconButton label="−5" onClick={() => nudge(-5)}>−5</IconButton>
        <IconButton label="−1" onClick={() => nudge(-1)}>−</IconButton>
        <div className="flex-1 text-center">
          <div className="text-3xl font-bold tabular-nums leading-none">{m.bpm}</div>
          <div className="text-[11px] text-muted">{SUBDIVISION_META[m.subdivision]}</div>
        </div>
        <IconButton label="+1" onClick={() => nudge(1)}>+</IconButton>
        <IconButton label="+5" onClick={() => nudge(5)}>+5</IconButton>
        <PlayButton />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <BeatDots />
        <div className="flex gap-1">
          {SUBDIVISIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => m.set({ subdivision: s })}
              className={`h-8 min-w-8 rounded-lg px-1.5 text-xs font-semibold ${m.subdivision === s ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"}`}
            >
              {SUB_SHORT[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
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
