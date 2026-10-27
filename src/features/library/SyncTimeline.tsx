import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui";
import { formatClockMs } from "@/lib/clock";
import type { Lane } from "@/lib/syncLane";
import type { SyncPoint } from "@/shared/types";

// The recording as a waveform with a vertical line where each marked bar starts. A line is dragged to move its
// mark; dragging elsewhere scrolls, a tap there seeks the recording. Drawn on one canvas the width of the view,
// so a long song at a close zoom doesn't need a canvas tens of thousands of pixels wide.
// Also: a fling keeps scrolling and slows down; a trackpad swipes sideways and pinches to zoom; ←/→ go from bar to
// bar, Shift+←/→ move the selected line (faster the longer the key is held), space plays.
// With `lane`, the tab's notes and bars are drawn above the waveform where the marks put them in the recording.

/** A mark's identity: the bar and which pass of it (repeats). */
export const markKey = (p: Pick<SyncPoint, "bar" | "occurrence">) => `${p.bar}:${p.occurrence ?? 0}`;

const BUCKETS_PER_SEC = 200;
// px per second, from the whole song on a phone to single strums.
const ZOOMS = [10, 25, 50, 100, 200, 400];
const WAVE_H = 80;
const LABEL_H = 16;
// The tab's notes above the waveform.
const LANE_H = 56;
// How near a touch has to be to a line to grab it, px.
const GRAB = 16;
// Marks keep their order: no closer than this to their neighbours, ms.
const GAP = 30;
// Shift+arrows: a line's step, ms (with Alt finer), times the hold's speed-up.
const LINE_STEP = { fine: 1, normal: 10 };
/** The keys the timeline reads (a React or a window event). */
type KeyPress = Pick<KeyboardEvent, "key" | "repeat" | "shiftKey" | "altKey" | "target" | "preventDefault">;
/** How much faster a held arrow goes after `t` seconds: steady at first, then quickly up to 25×. */
const speedUp = (t: number) => Math.min(25, 1 + 6 * t * t);
// A fling: px/ms it keeps per frame, and below which it stops.
const FRICTION = 0.94;
const MIN_SPEED = 0.02;

/** Loudest sample per 5 ms of the recording, 0…1. */
async function peaksOf(audio: ArrayBuffer) {
  const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(audio.slice(0));
  const data = buffer.getChannelData(0);
  const size = buffer.sampleRate / BUCKETS_PER_SEC;
  const peaks = new Float32Array(Math.ceil(data.length / size));
  let top = 0;
  for (let i = 0; i < peaks.length; i++) {
    let m = 0;
    for (let j = Math.floor(i * size), end = Math.min(data.length, Math.floor((i + 1) * size)); j < end; j++) m = Math.max(m, Math.abs(data[j]));
    peaks[i] = m;
    top = Math.max(top, m);
  }
  if (top > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= top;
  return { peaks, durationMs: buffer.duration * 1000 };
}

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function SyncTimeline({
  audio,
  player,
  points,
  selected,
  onSelect,
  onMove,
  onPreview,
  lane,
  globalKeys,
  onTime,
}: {
  audio: ArrayBuffer;
  player: RefObject<HTMLAudioElement | null>;
  points: SyncPoint[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  onMove: (p: SyncPoint, ms: number) => void;
  /** While a line is dragged (or a bar is stepped to): the time it's at, to show that place in the notes */
  onPreview?: (ms: number) => void;
  /** The tab on the recording's time for these marks (the dragged one where it is now) */
  lane?: (points: SyncPoint[]) => Lane;
  /** Keys work anywhere on the page (a dialog of its own), not only with the timeline focused */
  globalKeys?: boolean;
  /** Every frame while the recording plays: where it is, ms */
  onTime?: (ms: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wave, setWave] = useState<{ peaks: Float32Array; durationMs: number } | null>(null);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [start, setStart] = useState(0); // ms at the left edge
  const [drag, setDrag] = useState<{ key: string; ms: number } | null>(null);
  const gesture = useRef<
    { kind: "line"; point: SyncPoint } | { kind: "pan"; x: number; start: number; moved: boolean; v: number; lastX: number; lastT: number } | null
  >(null);
  const fling = useRef(0);
  const held = useRef({ key: "", since: 0 });
  const pinch = useRef(0);

  const height = WAVE_H + (lane ? LANE_H : 0);
  const pxPerMs = ZOOMS[zoom] / 1000;
  const viewMs = width / pxPerMs;
  const duration = wave?.durationMs ?? 0;
  const clampStart = (s: number) => Math.max(0, Math.min(s, Math.max(0, duration - viewMs)));
  // For listeners outside React's (wheel, the fling's frames): this render's values.
  const live = useRef({ clampStart, pxPerMs, zoomTo: (_z: number) => {}, zoom });

  useEffect(() => {
    let alive = true;
    setWave(null);
    peaksOf(audio).then(
      (w) => alive && setWave(w),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [audio]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Marks sorted by time, the dragged one where the finger is.
  const marks = points
    .map((p) => ({ p, ms: drag && markKey(p) === drag.key ? drag.ms : p.ms }))
    .sort((a, b) => a.ms - b.ms);
  const draft = drag ? points.map((p) => (markKey(p) === drag.key ? { ...p, ms: drag.ms } : p)) : points;
  const tabLane = lane?.(draft) ?? null;
  // Where ←/→ go: every bar of the tab when it's laid on the recording, else the marks.
  const stops = tabLane?.bars ?? marks.map((m) => ({ bar: m.p.bar, occurrence: m.p.occurrence ?? 0, ms: m.ms }));

  const draw = () => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(width * dpr)) c.width = Math.round(width * dpr);
    if (c.height !== height * dpr) c.height = height * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const accent = cssVar("--accent", "#378add");
    const muted = cssVar("--muted", "#9aa3b2");
    const text = cssVar("--text", "#000");
    const guide = cssVar("--guide", "#e24b4a");
    const x = (ms: number) => (ms - start) * pxPerMs;

    // The tab's bars (thin lines, numbers when there's room) and notes (by pitch), on the recording's time.
    const waveTop = tabLane ? LABEL_H + LANE_H : LABEL_H;
    if (tabLane) {
      const top = LABEL_H;
      g.fillStyle = cssVar("--surface-2", "#2a2f38");
      g.globalAlpha = 0.5;
      g.fillRect(0, top, width, LANE_H);
      g.globalAlpha = 1;
      g.font = "9px system-ui, sans-serif";
      let lastLabel = -Infinity;
      for (const b of tabLane.bars) {
        const bx = x(b.ms);
        if (bx < -20 || bx > width + 20) continue;
        g.fillStyle = muted;
        g.globalAlpha = 0.45;
        g.fillRect(Math.round(bx), top, 1, LANE_H);
        if (bx - lastLabel >= 22) {
          g.globalAlpha = 0.9;
          g.fillText(b.occurrence ? `${b.bar}·${b.occurrence + 1}` : String(b.bar), bx + 2, top + 9);
          lastLabel = bx;
        }
      }
      const [lo, hi] = tabLane.keys;
      g.fillStyle = cssVar("--chord", "#1d9e75");
      g.globalAlpha = 0.9;
      for (const n of tabLane.notes) {
        const nx = x(n.ms);
        if (nx < -2 || nx > width + 2) continue;
        const y = top + 12 + (1 - (n.key - lo) / Math.max(1, hi - lo)) * (LANE_H - 16);
        g.fillRect(nx, y, 3, 2);
      }
      g.globalAlpha = 1;
    }

    // Waveform: the loudest bucket under each pixel.
    if (wave) {
      const mid = waveTop + (height - waveTop) / 2;
      const half = (height - waveTop) / 2 - 2;
      g.fillStyle = muted;
      g.globalAlpha = 0.55;
      const perPx = BUCKETS_PER_SEC / 1000 / pxPerMs;
      for (let px = 0; px < width; px++) {
        const from = Math.floor(((start + px / pxPerMs) * BUCKETS_PER_SEC) / 1000);
        let m = 0;
        for (let i = from, end = Math.min(wave.peaks.length, from + Math.max(1, Math.ceil(perPx))); i < end; i++) m = Math.max(m, wave.peaks[i]);
        const h = Math.max(0.5, m * half);
        g.fillRect(px, mid - h, 1, h * 2);
      }
      g.globalAlpha = 1;
    }

    // Seconds along the top.
    g.fillStyle = muted;
    g.font = "10px system-ui, sans-serif";
    const step = [1, 2, 5, 10, 15, 30, 60].find((s) => s * 1000 * pxPerMs >= 56) ?? 60;
    for (let s = Math.ceil(start / 1000 / step) * step; s * 1000 < start + viewMs; s += step) {
      g.fillRect(x(s * 1000), 0, 1, 4);
      g.fillText(formatClockMs(s * 1000).replace(/\.\d+$/, ""), x(s * 1000) + 3, 10);
    }

    // Bar lines with their numbers.
    for (const { p, ms } of marks) {
      const lx = x(ms);
      if (lx < -30 || lx > width + 30) continue;
      const on = markKey(p) === (drag?.key ?? selected);
      g.fillStyle = accent;
      g.globalAlpha = on ? 1 : 0.6;
      g.fillRect(Math.round(lx) - (on ? 1 : 0.5), LABEL_H, on ? 2 : 1, height - LABEL_H);
      const label = p.occurrence ? `${p.bar}·${p.occurrence + 1}` : String(p.bar);
      const w = g.measureText(label).width + 8;
      g.globalAlpha = 1;
      g.fillStyle = on ? accent : cssVar("--surface-2", "#2a2f38");
      g.beginPath();
      g.roundRect(lx - w / 2, 2, w, LABEL_H - 3, 4);
      g.fill();
      g.fillStyle = on ? "#fff" : text;
      g.textAlign = "center";
      g.fillText(label, lx, LABEL_H - 4);
      g.textAlign = "left";
    }

    // Where the recording is.
    const now = (player.current?.currentTime ?? 0) * 1000;
    g.fillStyle = guide;
    g.fillRect(Math.round(x(now)), 0, 2, height);
  };

  // Redraw on every change; while the recording plays, every frame (and keep its position in view).
  useEffect(draw);
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    let frame = 0;
    const loop = () => {
      const now = el.currentTime * 1000;
      setStart((s) => (now < s || now > s + viewMs * 0.85 ? clampStart(now - viewMs * 0.15) : s));
      draw();
      if (!el.paused) onTime?.(now);
      if (!el.paused) frame = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const onSeek = () => !drag && requestAnimationFrame(loop);
    el.addEventListener("play", onPlay);
    el.addEventListener("seeked", onSeek);
    if (!el.paused) onPlay();
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("seeked", onSeek);
    };
  });

  // The selected mark comes into view (picked below the timeline, or just added).
  useEffect(() => {
    const p = points.find((x) => markKey(x) === selected);
    if (p && (p.ms < start || p.ms > start + viewMs)) setStart(clampStart(p.ms - viewMs / 3));
  }, [selected]);

  /** A mark's new time, between its neighbours, so marks never swap. */
  const clampMark = (point: SyncPoint, ms: number) => {
    const i = marks.findIndex((m) => m.p === point);
    const lo = i > 0 ? marks[i - 1].ms + GAP : 0;
    const hi = i + 1 < marks.length ? marks[i + 1].ms - GAP : duration;
    return Math.round(Math.max(lo, Math.min(hi, ms)));
  };

  const keyDown = (e: KeyPress) => {
    const el = player.current;
    const target = e.target as HTMLElement | null;
    if (e.key === " " && !target?.closest?.("button")) {
      e.preventDefault();
      if (el) void (el.paused ? el.play() : el.pause());
      return;
    }
    if (e.key === "+" || e.key === "=") return zoomTo(zoom + 1);
    if (e.key === "-" || e.key === "_") return zoomTo(zoom - 1);
    if (!globalKeys && e.key === "Escape") return onSelect(null);
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowLeft" ? -1 : 1;
    const point = points.find((x) => markKey(x) === selected);
    if (e.shiftKey) {
      // Shift: the selected line moves, faster the longer the key is held.
      if (!point) return;
      if (!e.repeat || held.current.key !== e.key) held.current = { key: e.key, since: performance.now() };
      const fast = speedUp((performance.now() - held.current.since) / 1000);
      const from = drag?.key === selected ? drag.ms : point.ms;
      const ms = clampMark(point, from + dir * LINE_STEP[e.altKey ? "fine" : "normal"] * fast);
      setDrag({ key: markKey(point), ms });
      if (ms < start || ms > start + viewMs) setStart(clampStart(ms - viewMs / 2));
      onPreview?.(ms);
      return;
    }
    // From bar to bar: the recording goes to the next (previous) bar's start, its mark gets selected if it has one.
    if (!el) return;
    const now = el.currentTime * 1000;
    const back = el.paused ? 30 : 400; // while playing, ← first goes back to the start of the bar being played
    const stop = dir > 0 ? stops.find((x) => x.ms > now + 30) : [...stops].reverse().find((x) => x.ms < now - back);
    if (!stop) return;
    el.currentTime = Math.max(0, stop.ms) / 1000;
    const mark = points.find((p) => p.bar === stop.bar && (p.occurrence ?? 0) === stop.occurrence);
    onSelect(mark ? markKey(mark) : null);
    if (stop.ms < start || stop.ms > start + viewMs * 0.85) setStart(clampStart(stop.ms - viewMs / 3));
    onPreview?.(stop.ms);
  };
  // The line moved by keys is saved once the key is let go.
  const saveKeyed = () => {
    held.current = { key: "", since: 0 };
    const point = points.find((x) => markKey(x) === drag?.key);
    if (point && drag && !gesture.current) {
      if (drag.ms !== point.ms) onMove(point, drag.ms);
      setDrag(null);
    }
  };
  const keyUp = (e: KeyPress) => (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Shift") && saveKeyed();
  // In a dialog of its own the keys work without focusing the timeline (but not while typing in a field).
  const keys = useRef({ keyDown, keyUp });
  keys.current = { keyDown, keyUp };
  useEffect(() => {
    if (!globalKeys) return;
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");
    const down = (e: KeyboardEvent) => !typing(e) && e.target !== canvas.current && keys.current.keyDown(e);
    const up = (e: KeyboardEvent) => !typing(e) && e.target !== canvas.current && keys.current.keyUp(e);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [globalKeys]);

  // Trackpad: a sideways swipe scrolls, a pinch (ctrl + wheel) zooms; an up-and-down wheel is left to the page.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const wheel = (e: WheelEvent) => {
      const { clampStart, pxPerMs, zoomTo, zoom } = live.current;
      if (e.ctrlKey) {
        e.preventDefault();
        pinch.current += e.deltaY;
        if (Math.abs(pinch.current) >= 40) {
          zoomTo(zoom + (pinch.current < 0 ? 1 : -1));
          pinch.current = 0;
        }
        return;
      }
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      cancelAnimationFrame(fling.current);
      const px = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      setStart((s) => clampStart(s + px / pxPerMs));
    };
    c.addEventListener("wheel", wheel, { passive: false });
    return () => c.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => () => cancelAnimationFrame(fling.current), []);

  const msAt = (clientX: number) => start + (clientX - canvas.current!.getBoundingClientRect().left) / pxPerMs;

  const down = (e: PointerEvent) => {
    if (!wave) return;
    cancelAnimationFrame(fling.current);
    (e.currentTarget as HTMLCanvasElement).focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const ms = msAt(e.clientX);
    const near = marks.map((m) => ({ ...m, d: Math.abs(m.ms - ms) * pxPerMs })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= GRAB) {
      gesture.current = { kind: "line", point: near.p };
      setDrag({ key: markKey(near.p), ms: near.ms });
      onSelect(markKey(near.p));
      onPreview?.(near.ms);
    } else gesture.current = { kind: "pan", x: e.clientX, start, moved: false, v: 0, lastX: e.clientX, lastT: e.timeStamp };
  };

  const move = (e: PointerEvent) => {
    const gs = gesture.current;
    if (!gs) return;
    if (gs.kind === "pan") {
      const dx = e.clientX - gs.x;
      if (Math.abs(dx) > 4) gs.moved = true;
      if (gs.moved) setStart(clampStart(gs.start - dx / pxPerMs));
      // The finger's speed, smoothed, for the fling.
      const dt = e.timeStamp - gs.lastT;
      if (dt > 0) gs.v = 0.7 * ((e.clientX - gs.lastX) / dt) + 0.3 * gs.v;
      gs.lastX = e.clientX;
      gs.lastT = e.timeStamp;
      return;
    }
    const ms = clampMark(gs.point, msAt(e.clientX));
    setDrag({ key: markKey(gs.point), ms });
    onPreview?.(ms);
  };

  const up = (e: PointerEvent) => {
    const gs = gesture.current;
    gesture.current = null;
    if (gs?.kind === "line" && drag) {
      if (drag.ms !== gs.point.ms) onMove(gs.point, drag.ms);
      setDrag(null);
    } else if (gs?.kind === "pan" && gs.moved && Math.abs(gs.v) > MIN_SPEED && e.timeStamp - gs.lastT < 80) {
      // Let go while moving: keep going and slow down.
      let v = gs.v;
      let last = performance.now();
      const step = (t: number) => {
        const { clampStart, pxPerMs } = live.current;
        const dt = Math.min(50, t - last);
        last = t;
        setStart((s) => clampStart(s - (v * dt) / pxPerMs));
        v *= Math.pow(FRICTION, dt / 16);
        if (Math.abs(v) > MIN_SPEED) fling.current = requestAnimationFrame(step);
      };
      fling.current = requestAnimationFrame(step);
    } else if (gs?.kind === "pan" && !gs.moved && player.current) {
      // A tap: the recording goes there.
      player.current.currentTime = Math.max(0, msAt(e.clientX)) / 1000;
      onSelect(null);
    }
  };

  const zoomTo = (z: number) => {
    const next = Math.max(0, Math.min(ZOOMS.length - 1, z));
    // Keep the middle of the view (or the selected line) in place.
    const centre = points.find((x) => markKey(x) === selected)?.ms ?? start + viewMs / 2;
    const nextView = width / (ZOOMS[next] / 1000);
    setZoom(next);
    setStart(Math.max(0, Math.min(centre - nextView / 2, Math.max(0, duration - nextView))));
  };

  live.current = { clampStart, pxPerMs, zoomTo, zoom };

  return (
    <div className="space-y-1.5">
      <div ref={box} className="relative overflow-hidden rounded-xl bg-surface" style={{ height }}>
        <canvas
          ref={canvas}
          style={{ width, height, touchAction: "none" }}
          tabIndex={0}
          aria-label="Запись с отметками тактов: ←/→ — от такта к такту, Shift+←/→ двигают выбранную линию, пробел — играть"
          onKeyDown={keyDown}
          onKeyUp={keyUp}
          onBlur={saveKeyed}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="block cursor-crosshair rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        />
        {!wave && (
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-muted">
            {error ? (
              `Не удалось прочитать запись: ${error}`
            ) : (
              <>
                <LoaderCircle className="size-3.5 animate-spin" /> Рисую запись…
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <div className="flex-1 text-xs tabular-nums text-muted">
          {drag ? `Такт ${drag.key.split(":")[0]} → ${formatClockMs(drag.ms)}` : wave ? `${formatClockMs(start)} – ${formatClockMs(Math.min(duration, start + viewMs))}` : ""}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Отдалить" title="Отдалить" disabled={zoom === 0} onClick={() => zoomTo(zoom - 1)}>
          <ZoomOut className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Приблизить" title="Приблизить" disabled={zoom === ZOOMS.length - 1} onClick={() => zoomTo(zoom + 1)}>
          <ZoomIn className="size-4" />
        </Button>
      </div>
    </div>
  );
}
