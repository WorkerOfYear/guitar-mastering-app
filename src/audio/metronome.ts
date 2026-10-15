import { audio } from "./player";
import { loadSamples, playClick, samplesReady, silenceClicks, type ClickKind } from "./clicks";
import { planTick, rhythmById } from "./rhythms";
import { clampBpm, useMetronome } from "@/store/metronome";

// Sample-accurate metronome: a short timer looks ahead and schedules clicks on the audio clock,
// so timing doesn't drift when the main thread is busy (the classic "two clocks" approach).

const LOOKAHEAD_SEC = 0.12;
const TIMER_MS = 25;

let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let tick = 0;
let lastPerBar = 0;

function schedule() {
  const { ctx } = audio();
  while (nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
    const { bpm, beats, rhythm: rhythmId, accents, click, volume } = useMetronome.getState();
    const rhythm = rhythmById(rhythmId);
    const perBar = beats * rhythm.grid;
    if (perBar !== lastPerBar) {
      // meter or pattern changed — start a fresh bar instead of landing mid-way
      lastPerBar = perBar;
      tick = 0;
    }
    const pos = tick % perBar;
    const { beat, tick: sub, kind } = planTick(rhythm, beats, accents, pos);
    const gap = 60 / bpm / rhythm.grid;
    // a click may last until just before the next tick, so fast tempos stay crisp
    if (kind) playClick(click, nextTime, kind, volume, gap * 0.85);
    if (kind || !sub) {
      const delay = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      setTimeout(() => {
        if (!useMetronome.getState().running) return;
        // `beat` marks the start of a beat (screen flash), `note` every sounding note (beat circles)
        useMetronome.setState((s) => ({ ...(sub ? {} : { beat }), ...(kind ? { note: { beat, id: s.note.id + 1 } } : {}) }));
      }, delay);
    }
    nextTime += gap;
    tick++;
  }
}

function begin() {
  const { ctx } = audio();
  tick = 0;
  lastPerBar = 0;
  nextTime = ctx.currentTime + 0.08;
  schedule();
  timer = setInterval(schedule, TIMER_MS);
}

export function startMetronome() {
  if (timer || useMetronome.getState().running) return;
  audio(); // create/resume the context inside the tap
  useMetronome.setState({ running: true, beat: -1 });
  if (useMetronome.getState().click === "metronomus" && !samplesReady()) {
    // The first click must already be the chosen sound, not the stand-in beep: wait for the recordings.
    void loadSamples().finally(() => useMetronome.getState().running && !timer && begin());
    return;
  }
  begin();
}

export function stopMetronome() {
  if (timer) clearInterval(timer);
  timer = null;
  silenceClicks();
  useMetronome.setState((s) => ({ running: false, beat: -1, note: { beat: -1, id: s.note.id } }));
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
  const { click } = useMetronome.getState();
  [0, 0.18, 0.36].forEach((d, i) => playClick(click, t + d, i === 2 ? "accent" : "beat", 1));
}

/** One click in the chosen sound — to try it out. */
export function previewClick(id: string, kind: ClickKind = "beat") {
  const { ctx } = audio();
  void loadSamples();
  playClick(id, ctx.currentTime + 0.02, kind, useMetronome.getState().volume);
}
