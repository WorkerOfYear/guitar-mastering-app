// Runs auto-sync's heavy part off the main thread.
import { align, onsetEnvelope, type ScoreTimeline } from "./align";
import { audioChroma } from "./chroma";
import { checkMatch } from "./matchCheck";

interface Job {
  channels: Float32Array[];
  sampleRate: number;
  timeline: ScoreTimeline;
  anchors?: number[];
}

self.onmessage = (e: MessageEvent<Job>) => {
  try {
    const { channels, sampleRate, timeline, anchors } = e.data;
    const mono = new Float32Array(channels[0].length);
    for (const ch of channels) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channels.length;
    const env = onsetEnvelope(mono, sampleRate);
    const result = align(timeline, env, anchors, audioChroma(mono, sampleRate));
    // Then whether the recording fits the tab at all: another tuning, another song, only a part of it.
    self.postMessage({ result: { ...result, check: checkMatch(timeline, mono, sampleRate, result) } });
  } catch (err) {
    self.postMessage({ error: (err as Error).message });
  }
};
