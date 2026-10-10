import { midiToFreq } from "@/music/notes";

// A light plucked-string synth on the Web Audio API — enough to hear a note or a chord shape.
// The context is created on the first tap (browsers only allow audio after a user gesture).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // iOS: play through the silent switch like a music app (Safari 17+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

export function playNote(midi: number, delay = 0, duration = 1.8) {
  const { ctx, out } = audio();
  const t = ctx.currentTime + delay;
  const freq = midiToFreq(midi);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(8000, freq * 8), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.5), t + duration * 0.6);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.35, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  for (const [type, detune, level] of [["sawtooth", -4, 0.5], ["triangle", 3, 0.8]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.value = level;
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
  filter.connect(env).connect(out);
}

/** Strum low → high, like a downstroke. */
export function strum(midis: number[], gap = 0.03) {
  [...midis].sort((a, b) => a - b).forEach((m, i) => playNote(m, i * gap, 2.4));
}
