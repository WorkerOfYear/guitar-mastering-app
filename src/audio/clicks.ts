import { audio } from "./player";

// Click sounds. «Метрономус» plays the two recordings from metronom.us (finger click, ping-pong accent);
// the others are synthesized, so they need no files.

export type ClickKind = "accent" | "beat" | "sub";

export interface ClickSound {
  id: string;
  name: string;
  hint: string;
}

export const CLICKS: ClickSound[] = [
  { id: "metronomus", name: "Метрономус", hint: "Щелчок пальцем, акцент — пинг-понг" },
  { id: "classic", name: "Классика", hint: "Чистый электронный писк" },
  { id: "wood", name: "Дерево", hint: "Деревянный блок" },
  { id: "hat", name: "Хай-хэт", hint: "Короткий шумовой тик" },
];

export const DEFAULT_CLICK = "metronomus";
export const clickById = (id: string) => CLICKS.find((c) => c.id === id) ?? CLICKS[0];

const LEVEL: Record<ClickKind, number> = { accent: 1, beat: 0.8, sub: 0.4 };

// ---------- output bus

// Clicks are scheduled a little ahead of time. Everything goes through one gain node, so that Stop
// can cut the ones still waiting in the audio graph instead of letting them sound after the button.
let bus: GainNode | null = null;
function out() {
  const { ctx, out: master } = audio();
  if (!bus) {
    bus = ctx.createGain();
    bus.connect(master);
  }
  return bus;
}

/** Drop every click that has been scheduled but has not sounded yet. */
export function silenceClicks() {
  if (!bus) return;
  bus.gain.cancelScheduledValues(0);
  bus.gain.value = 0;
  bus.disconnect();
  bus = null;
}

export const samplesReady = () => buffers.size === Object.keys(SAMPLE_FILES).length;

// ---------- recordings

const SAMPLE_FILES = { accent: "pingpong2.mp3", beat: "finger_click.mp3" } as const;
const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Fetch and decode the recordings once; until they are ready the classic beep stands in. */
export function loadSamples() {
  loading ??= (async () => {
    const { ctx } = audio();
    await Promise.all(
      Object.values(SAMPLE_FILES).map(async (file) => {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/${file}`);
        if (!res.ok) throw new Error(`sound ${file}: ${res.status}`);
        buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
      }),
    );
  })().catch(() => {
    loading = null; // try again next time
  });
  return loading;
}

function sample(time: number, file: string, gain: number): boolean {
  const buf = buffers.get(file);
  if (!buf) return false;
  const { ctx } = audio();
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(g).connect(out());
  src.start(time);
  return true;
}

// ---------- synthesized

function blip(time: number, freq: number, level: number, attack: number, decay: number, type: OscillatorType = "sine") {
  const { ctx } = audio();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(Math.max(0.001, level), time + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  osc.connect(env).connect(out());
  osc.start(time);
  osc.stop(time + decay + 0.01);
}

const CLASSIC_FREQ: Record<ClickKind, number> = { accent: 1760, beat: 1175, sub: 880 };
const WOOD_FREQ: Record<ClickKind, number> = { accent: 1500, beat: 1100, sub: 850 };

let noise: AudioBuffer | null = null;
function noiseBuffer() {
  if (!noise) {
    const { ctx } = audio();
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.1), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function hat(time: number, kind: ClickKind, level: number) {
  const { ctx } = audio();
  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  const env = ctx.createGain();
  const decay = kind === "accent" ? 0.07 : 0.035;
  src.buffer = noiseBuffer();
  hp.type = "highpass";
  hp.frequency.value = kind === "accent" ? 6000 : 8000;
  env.gain.setValueAtTime(Math.max(0.001, level), time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  src.connect(hp).connect(env).connect(out());
  src.start(time);
  src.stop(time + decay + 0.01);
}

/** Play one click at audio-clock `time`. */
export function playClick(id: string, time: number, kind: ClickKind, volume: number) {
  const level = LEVEL[kind] * volume;
  switch (id) {
    case "metronomus": {
      const file = kind === "accent" ? SAMPLE_FILES.accent : SAMPLE_FILES.beat;
      if (sample(time, file, level)) return;
      void loadSamples();
      break; // not decoded yet — fall through to the beep
    }
    case "wood":
      blip(time, WOOD_FREQ[kind], level, 0.001, 0.05, "triangle");
      blip(time, WOOD_FREQ[kind] * 2.4, level * 0.35, 0.001, 0.025);
      return;
    case "hat":
      hat(time, kind, level);
      return;
  }
  blip(time, CLASSIC_FREQ[kind], level, 0.002, 0.04);
}
