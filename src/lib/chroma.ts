// What sounds when: pitch classes ("chroma", 12 values per frame) of the recording and of the tab's notes,
// so beats can be compared by harmony as well as by rhythm (beats.ts). Kept free of alphaTab and the DOM
// so it runs in the worker.

export const CHROMA_FPS = 25; // 40 ms frames
const SR = 11025; // chroma is computed on audio downsampled to this rate
const WIN = 1024; // ~93 ms window

export interface ScoreNote {
  /** Start and end in ms at the tab's own tempo (playback order, repeats included) */
  ms: number;
  end: number;
  /** MIDI key */
  key: number;
}

// ---------- audio features

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** 12 pitch-class energies per frame (CHROMA_FPS frames per second), each frame normalised to length 1. */
export function audioChroma(samples: Float32Array, sampleRate: number): Float32Array {
  // Downsample by averaging (a crude low-pass, enough for 70 Hz – 2 kHz).
  const step = sampleRate / SR;
  const n = Math.floor(samples.length / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    let s = 0;
    for (let k = a; k < b && k < samples.length; k++) s += samples[k];
    x[i] = s / (b - a);
  }
  const hop = SR / CHROMA_FPS;
  const frames = Math.max(0, Math.floor((n - WIN) / hop) + 1);
  const out = new Float32Array(frames * 12);
  const window = new Float32Array(WIN).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WIN));
  // FFT bin → pitch class (bins between 70 Hz and 2 kHz).
  const pc = new Int8Array(WIN / 2).fill(-1);
  for (let k = 1; k < WIN / 2; k++) {
    const f = (k * SR) / WIN;
    if (f < 70 || f > 2000) continue;
    pc[k] = ((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12;
  }
  const re = new Float32Array(WIN);
  const im = new Float32Array(WIN);
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(f * hop);
    for (let i = 0; i < WIN; i++) {
      re[i] = (x[start + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    const o = f * 12;
    for (let k = 1; k < WIN / 2; k++) if (pc[k] >= 0) out[o + pc[k]] += Math.log1p(1000 * Math.hypot(re[k], im[k]));
    normalise(out, o);
  }
  return out;
}

function normalise(v: Float32Array, o: number) {
  let s = 0;
  for (let c = 0; c < 12; c++) s += v[o + c] * v[o + c];
  s = Math.sqrt(s);
  if (s > 0) for (let c = 0; c < 12; c++) v[o + c] /= s;
}

// ---------- score features

/** What the tab should sound like, frame by frame: chroma of the ringing notes, fading after the attack. */
export function scoreChroma(notes: ScoreNote[], durationMs: number) {
  const frames = Math.ceil((durationMs / 1000) * CHROMA_FPS) + 1;
  const chroma = new Float32Array(frames * 12);
  for (const n of notes) {
    const a = Math.floor((n.ms / 1000) * CHROMA_FPS);
    const b = Math.min(frames - 1, Math.ceil((Math.max(n.end, n.ms + 1) / 1000) * CHROMA_FPS));
    for (let f = Math.max(0, a); f <= b; f++) {
      const w = Math.exp(-((f - a) / CHROMA_FPS) / 0.6); // a plucked note fades
      chroma[f * 12 + (n.key % 12)] += w;
      chroma[f * 12 + ((n.key + 7) % 12)] += 0.4 * w; // its strong 3rd harmonic (a fifth up), loud on a distorted guitar
    }
  }
  for (let f = 0; f < frames; f++) normalise(chroma, f * 12);
  return chroma;
}

/** Mean chroma over each span [from, to) given in ms, unit length (12 values per span). */
export function spanChroma(chroma: Float32Array, spans: [number, number][]) {
  const frames = chroma.length / 12;
  const out = new Float32Array(spans.length * 12);
  spans.forEach(([a, b], i) => {
    const f0 = Math.max(0, Math.floor((a / 1000) * CHROMA_FPS));
    const f1 = Math.min(frames, Math.max(f0 + 1, Math.floor((b / 1000) * CHROMA_FPS)));
    for (let f = f0; f < f1; f++) for (let c = 0; c < 12; c++) out[i * 12 + c] += chroma[f * 12 + c];
    normalise(out, i * 12);
  });
  return out;
}

