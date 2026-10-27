import * as alphaTab from "@coderline/alphatab";
import { cutBars, FPS, type AutoSyncResult, type ScoreTimeline } from "./align";
import type { SyncPoint } from "@/shared/types";
import type { ScoreNote } from "./chroma";

// Automatic alignment of a recording with its tab.
//  1. Where should notes sound? Note-on times from the score's MIDI (all tracks, drums weighted most).
//  2. Where do notes sound? Onsets in the recording: spectral flux of the audio, 100 frames per second.
//  3. Find candidate offsets and tempo factors that line both up, then follow the recording piece by piece
//     (every 4 bars and at the tab's tempo changes), each piece with a tempo of its own, so a live performance
//     that drifts, or a band that plays a tempo change differently from the tab, still matches.
//  4. Beat by beat (beats.ts): track the recording's beats and pair them with the tab's by rhythm and
//     harmony, so a section the band plays shorter or longer than the tab is followed too; every bar gets a mark.

export function scoreTimeline(score: alphaTab.model.Score): ScoreTimeline {
  const midi = new alphaTab.midi.MidiFile();
  const generator = new alphaTab.midi.MidiFileGenerator(score, new alphaTab.Settings(), new alphaTab.midi.AlphaSynthMidiFileHandler(midi));
  generator.generate();

  // Tempo map: tick → ms.
  const division = midi.division || 960;
  const tempos: { tick: number; ms: number; usPerQuarter: number }[] = [{ tick: 0, ms: 0, usPerQuarter: 60_000_000 / (score.tempo || 120) }];
  for (const e of midi.events) {
    if (e.type !== alphaTab.midi.MidiEventType.TempoChange) continue;
    const last = tempos[tempos.length - 1];
    const ms = last.ms + ((e.tick - last.tick) * last.usPerQuarter) / division / 1000;
    tempos.push({ tick: e.tick, ms, usPerQuarter: (e as alphaTab.midi.TempoChangeEvent).microSecondsPerQuarterNote });
  }
  let ti = 0;
  const toMs = (tick: number) => {
    while (ti + 1 < tempos.length && tempos[ti + 1].tick <= tick) ti++;
    while (ti > 0 && tempos[ti].tick > tick) ti--;
    const t = tempos[ti];
    return t.ms + ((tick - t.tick) * t.usPerQuarter) / division / 1000;
  };

  const byTick = new Map<number, number>();
  for (const e of midi.events) {
    if (e.type !== alphaTab.midi.MidiEventType.NoteOn) continue;
    const n = e as alphaTab.midi.NoteOnEvent;
    if (n.noteVelocity === 0) continue;
    const w = n.channel === 9 ? 1 : 0.5; // drums carry the clearest attacks
    byTick.set(e.tick, (byTick.get(e.tick) ?? 0) + w);
  }
  ti = 0;
  const onsets = [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, w]) => ({ ms: toMs(tick), w: Math.log1p(w) }));

  // Pitched notes with their length (drums only count as onsets).
  ti = 0;
  const notes: ScoreNote[] = [];
  const ringing = new Map<number, number[]>(); // channel·key → start ticks
  for (const e of midi.events) {
    if (e.type !== alphaTab.midi.MidiEventType.NoteOn && e.type !== alphaTab.midi.MidiEventType.NoteOff) continue;
    const n = e as alphaTab.midi.NoteOnEvent;
    if (n.channel === 9) continue;
    const id = n.channel * 128 + n.noteKey;
    if (e.type === alphaTab.midi.MidiEventType.NoteOn && n.noteVelocity > 0) ringing.set(id, [...(ringing.get(id) ?? []), e.tick]);
    else {
      const start = ringing.get(id)?.shift();
      if (start !== undefined) notes.push({ ms: start, end: e.tick, key: n.noteKey });
    }
  }
  notes.sort((a, b) => a.ms - b.ms);
  for (const n of notes) n.ms = toMs(n.ms);
  ti = 0;
  for (const n of [...notes].sort((a, b) => a.end - b.end)) n.end = toMs(n.end);

  ti = 0;
  const seen = new Map<number, number>();
  const bars = generator.tickLookup.masterBars.map((m) => {
    const bar = m.masterBar.index + 1;
    const occurrence = seen.get(bar) ?? 0;
    seen.set(bar, occurrence + 1);
    return { bar, occurrence, ms: toMs(m.start) };
  });
  // Every beat in playback order: quarter notes (or dotted quarters in 6/8, 9/8, 12/8).
  ti = 0;
  const beats: number[] = [];
  for (const m of generator.tickLookup.masterBars) {
    const { timeSignatureNumerator: num, timeSignatureDenominator: den } = m.masterBar;
    const count = den === 8 && num % 3 === 0 ? num / 3 : den === 8 ? num / 2 : num;
    const n = Math.max(1, Math.round(count));
    for (let k = 0; k < n; k++) beats.push(toMs(m.start + ((m.end - m.start) * k) / n));
  }
  const lastBar = generator.tickLookup.masterBars.at(-1);
  // Bars the tab changes tempo in (each bar once, at its first pass).
  const tempoBars = [
    ...new Set(
      tempos
        .slice(1)
        .map((t) => generator.tickLookup.masterBars.find((m) => m.start <= t.tick && t.tick < m.end)?.masterBar.index)
        .filter((i): i is number => i !== undefined && i > 0)
        .map((i) => i + 1),
    ),
  ];
  ti = 0;
  return { onsets, notes, beats, bars, tempoBars, durationMs: lastBar ? toMs(lastBar.end) : (onsets.at(-1)?.ms ?? 0) };
}

/**
 * Everything in one go, in the browser: decode the recording and build the tab's timeline here,
 * then let a worker do the heavy part (onset detection and matching) so the page stays responsive.
 */
export async function autoSync(
  gpFile: ArrayBuffer,
  audio: ArrayBuffer,
  anchors?: number[],
  /** Bars the recording doesn't play (cut out of the tab first) and marks set by hand (kept, fitted around) */
  known: { skip?: number[]; pins?: SyncPoint[] } = {},
): Promise<AutoSyncResult> {
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(gpFile), new alphaTab.Settings());
  const timeline = cutBars(scoreTimeline(score), known.skip ?? []);
  const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(audio.slice(0));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
  const worker = new Worker(new URL("./align.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<AutoSyncResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ result?: AutoSyncResult; error?: string }>) =>
        e.data.result ? resolve(e.data.result) : reject(new Error(e.data.error ?? "Ошибка анализа"));
      worker.onerror = (e) => reject(new Error(e.message || "Ошибка анализа"));
      worker.postMessage({ channels, sampleRate: buffer.sampleRate, timeline, anchors, pins: known.pins }, channels.map((c) => c.buffer));
    });
  } finally {
    worker.terminate();
  }
}

export { FPS };
