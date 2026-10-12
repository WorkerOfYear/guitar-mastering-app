// Runs auto-sync's heavy part off the main thread.
import { align, onsetEnvelope, type ScoreTimeline } from "./align";
import { audioChroma } from "./chroma";

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
    self.postMessage({ result: align(timeline, env, anchors, audioChroma(mono, sampleRate)) });
  } catch (err) {
    self.postMessage({ error: (err as Error).message });
  }
};
