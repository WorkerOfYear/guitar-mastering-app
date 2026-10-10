import { audio } from "./player";
import { clampBpm, useMetronome } from "@/store/metronome";

// Sample-accurate metronome: a short timer looks ahead and schedules clicks on the audio clock,
// so timing doesn't drift when the main thread is busy (the classic "two clocks" approach).

const LOOKAHEAD_SEC = 0.12;
const TIMER_MS = 25;

let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let tick = 0;
let bars = 0;

type Kind = "accent" | "beat" | "sub";
const FREQ: Record<Kind, number> = { accent: 1760, beat: 1175, sub: 880 };
const LEVEL: Record<Kind, number> = { accent: 1, beat: 0.75, sub: 0.35 };

function click(time: number, kind: Kind, volume: number) {
  const { ctx, out } = audio();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = FREQ[kind];
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(Math.max(0.001, LEVEL[kind] * volume), time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
  osc.connect(env).connect(out);
  osc.start(time);
  osc.stop(time + 0.05);
}

function schedule() {
  const { ctx } = audio();
  while (nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
    const { bpm, beats, subdivision, accent, volume, trainer } = useMetronome.getState();
    const perBar = beats * subdivision;
    const pos = tick % perBar;
    const beat = Math.floor(pos / subdivision);
    const sub = pos % subdivision;
    click(nextTime, sub ? "sub" : beat === 0 && accent ? "accent" : "beat", volume);
    if (!sub) {
      const delay = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      setTimeout(() => useMetronome.getState().running && useMetronome.setState({ beat }), delay);
    }
    nextTime += 60 / bpm / subdivision;
    tick++;
    if (pos === perBar - 1) {
      bars++;
      if (trainer.enabled && bars % trainer.everyBars === 0 && bpm < trainer.target) {
        useMetronome.setState({ bpm: clampBpm(Math.min(trainer.target, bpm + trainer.step)) });
      }
    }
  }
}

export function startMetronome() {
  if (timer) return;
  const { ctx } = audio();
  tick = 0;
  bars = 0;
  nextTime = ctx.currentTime + 0.08;
  useMetronome.setState({ running: true, beat: -1 });
  schedule();
  timer = setInterval(schedule, TIMER_MS);
}

export function stopMetronome() {
  if (timer) clearInterval(timer);
  timer = null;
  useMetronome.setState({ running: false, beat: -1 });
}

export const toggleMetronome = () => (useMetronome.getState().running ? stopMetronome() : startMetronome());

// ---------- tap tempo
let taps: number[] = [];
export function tapTempo() {
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < 2500), now].slice(-5);
  if (taps.length < 2) return null;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]);
  const bpm = clampBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
  useMetronome.setState({ bpm });
  return bpm;
}

/** Three short beeps — end of a block. */
export function signal() {
  const { ctx } = audio();
  const t = ctx.currentTime + 0.02;
  [0, 0.18, 0.36].forEach((d, i) => click(t + d, i === 2 ? "accent" : "beat", 1));
}
