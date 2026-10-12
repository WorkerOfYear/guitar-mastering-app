import { useEffect, useRef, useState, type RefObject } from "react";
import * as alphaTab from "@coderline/alphatab";

// Songsterr-style tab player on alphaTab: renders the tab, plays it with a guitar sound font,
// moves a cursor and scrolls along. Playback is controlled from outside (`playing`), so a session
// can start and stop it on its own timer.

/** Lets a tap start playback directly (inside the user gesture, which browsers require for audio). */
export interface PlayerControl {
  resume: () => void;
}

export interface ScoreInfo {
  title: string;
  tempo: number;
  bars: number;
  tracks: string[];
  /** Section markers from the file (Intro, Solo…), with their first bar (1-based) */
  sections: { title: string; bar: number }[];
}

interface Props {
  tex?: string;
  file?: ArrayBuffer;
  /** Desired tempo in bpm; playback speed = bpm / tempo written in the tab */
  bpm?: number;
  /** Or a speed factor directly (1 = original) */
  speed?: number;
  playing: boolean;
  /** Bars to loop, 1-based inclusive; otherwise the whole piece loops */
  loopBars?: [number, number] | null;
  track?: number;
  countIn?: boolean;
  metronome?: boolean;
  /** Fixed height of the scroll area */
  height?: string;
  onScore?: (info: ScoreInfo) => void;
  /** Playback did not start (blocked autoplay or still loading) */
  onBlocked?: (blocked: boolean) => void;
  onProgress?: (bar: number) => void;
  control?: RefObject<PlayerControl | null>;
}

export default function TabPlayer({ tex, file, bpm, speed, playing, loopBars, track = 0, countIn = false, metronome = false, height = "50vh", onScore, onBlocked, onProgress, control }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<alphaTab.AlphaTabApi | null>(null);
  const score = useRef<alphaTab.model.Score | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cb = useRef({ onScore, onBlocked, onProgress });
  cb.current = { onScore, onBlocked, onProgress };

  // Create the player for this source.
  useEffect(() => {
    if (!host.current || !scroller.current || (!tex && !file)) return;
    const settings = new alphaTab.Settings();
    settings.core.fontDirectory = "/font/";
    settings.display.staveProfile = alphaTab.StaveProfile.Tab;
    settings.display.scale = 1;
    settings.display.resources.mainGlyphColor = alphaTab.model.Color.fromJson(getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#000")!;
    settings.display.resources.staffLineColor = alphaTab.model.Color.fromJson(getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#888")!;
    settings.display.resources.barSeparatorColor = settings.display.resources.staffLineColor;
    settings.display.resources.barNumberColor = settings.display.resources.staffLineColor;
    settings.display.resources.scoreInfoColor = settings.display.resources.mainGlyphColor;
    // Keep it Songsterr-clean: no title block, tuning, dynamics or tempo marks.
    for (const el of [
      alphaTab.NotationElement.ScoreTitle,
      alphaTab.NotationElement.ScoreSubTitle,
      alphaTab.NotationElement.ScoreArtist,
      alphaTab.NotationElement.ScoreAlbum,
      alphaTab.NotationElement.ScoreWords,
      alphaTab.NotationElement.ScoreMusic,
      alphaTab.NotationElement.ScoreWordsAndMusic,
      alphaTab.NotationElement.ScoreCopyright,
      alphaTab.NotationElement.GuitarTuning,
      alphaTab.NotationElement.TrackNames,
      alphaTab.NotationElement.EffectDynamics,
    ])
      settings.notation.elements.set(el, false);
    settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
    settings.player.soundFont = "/soundfont/sonivox.sf2";
    settings.player.scrollElement = scroller.current;
    settings.player.scrollOffsetY = -40;
    settings.player.enableCursor = true;
    settings.player.enableAnimatedBeatCursor = true;
    settings.player.enableUserInteraction = true;

    const a = new alphaTab.AlphaTabApi(host.current, settings);
    api.current = a;
    a.scoreLoaded.on((s) => {
      score.current = s;
      setLoading(false);
      cb.current.onScore?.({
        title: s.title,
        tempo: s.tempo,
        bars: s.masterBars.length,
        tracks: s.tracks.map((t) => t.name || `Дорожка ${t.index + 1}`),
        sections: s.masterBars.flatMap((m, i) => (m.section ? [{ title: m.section.text || m.section.marker, bar: i + 1 }] : [])),
      });
    });
    a.playerReady.on(() => setReady(true));
    a.error.on((e) => setError(e.message));
    a.playerPositionChanged.on(() => {
      const t = a.tickPosition;
      const bars = score.current?.masterBars ?? [];
      let bar = 0;
      while (bar + 1 < bars.length && bars[bar + 1].start <= t) bar++;
      cb.current.onProgress?.(bar + 1);
    });
    a.isLooping = true;
    if (control) control.current = { resume: () => a.play() };
    if (tex) a.tex(tex);
    else if (file) a.load(file, [track]);
    return () => {
      a.destroy();
      api.current = null;
      setReady(false);
      setLoading(true);
    };
  }, [tex, file]);

  // Track switch without reloading the file.
  useEffect(() => {
    const a = api.current;
    if (a && score.current && file && score.current.tracks[track]) a.renderTracks([score.current.tracks[track]]);
  }, [track, file]);

  // Tempo, loop range, count-in and metronome.
  useEffect(() => {
    const a = api.current;
    if (!a || !score.current) return;
    const s = score.current;
    a.playbackSpeed = Math.min(2, Math.max(0.25, speed ?? (bpm && s.tempo ? bpm / s.tempo : 1)));
    a.countInVolume = countIn ? 1 : 0;
    a.metronomeVolume = metronome ? 1 : 0;
    if (loopBars && s.masterBars.length) {
      const first = s.masterBars[Math.max(0, loopBars[0] - 1)];
      const last = s.masterBars[Math.min(s.masterBars.length - 1, loopBars[1] - 1)];
      const range = new alphaTab.synth.PlaybackRange();
      range.startTick = first.start;
      range.endTick = last.start + last.calculateDuration();
      a.playbackRange = range;
      a.tickPosition = first.start;
    } else a.playbackRange = null;
  }, [bpm, speed, loopBars?.[0], loopBars?.[1], countIn, metronome, ready, loading]);

  // Play / pause from outside. If the browser blocks audio without a tap, tell the parent.
  useEffect(() => {
    const a = api.current;
    if (!a || !ready) return;
    if (!playing) {
      a.pause();
      return;
    }
    a.play();
    const t = setTimeout(() => cb.current.onBlocked?.(a.playerState !== alphaTab.synth.PlayerState.Playing), 1500);
    return () => clearTimeout(t);
  }, [playing, ready]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-surface">
      <div ref={scroller} className="overflow-y-auto overscroll-contain" style={{ height }}>
        <div ref={host} className="at-host px-2" />
      </div>
      {(loading || (!ready && !error)) && (
        <div className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs text-muted">
          {loading ? "Загружаю таб…" : "Загружаю звук гитары…"}
        </div>
      )}
      {error && <div className="absolute inset-x-0 top-2 px-3 text-center text-xs text-guide">Не удалось открыть таб: {error}</div>}
    </div>
  );
}
