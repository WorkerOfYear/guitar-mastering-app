import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui";
import { formatClockMs } from "@/lib/clock";
import type { SyncPoint } from "@/shared/types";

// The recording as a waveform with a vertical line where each marked bar starts. A line is dragged to move its
// mark; dragging elsewhere scrolls, a tap there seeks the recording. Drawn on one canvas the width of the view,
// so a long song at a close zoom doesn't need a canvas tens of thousands of pixels wide.

/** A mark's identity: the bar and which pass of it (repeats). */
export const markKey = (p: Pick<SyncPoint, "bar" | "occurrence">) => `${p.bar}:${p.occurrence ?? 0}`;

const BUCKETS_PER_SEC = 200;
// px per second, from the whole song on a phone to single strums.
const ZOOMS = [10, 25, 50, 100, 200, 400];
const HEIGHT = 96;
const LABEL_H = 16;
// How near a touch has to be to a line to grab it, px.
const GRAB = 16;
// Marks keep their order: no closer than this to their neighbours, ms.
const GAP = 30;

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
}: {
  audio: ArrayBuffer;
  player: RefObject<HTMLAudioElement | null>;
  points: SyncPoint[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  onMove: (p: SyncPoint, ms: number) => void;
  /** While a line is dragged: the time it's at, to show that place in the notes */
  onPreview?: (ms: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wave, setWave] = useState<{ peaks: Float32Array; durationMs: number } | null>(null);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [start, setStart] = useState(0); // ms at the left edge
  const [drag, setDrag] = useState<{ key: string; ms: number } | null>(null);
  const gesture = useRef<{ kind: "line"; point: SyncPoint } | { kind: "pan"; x: number; start: number; moved: boolean } | null>(null);

  const pxPerMs = ZOOMS[zoom] / 1000;
  const viewMs = width / pxPerMs;
  const duration = wave?.durationMs ?? 0;
  const clampStart = (s: number) => Math.max(0, Math.min(s, Math.max(0, duration - viewMs)));

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

  const draw = () => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(width * dpr)) c.width = Math.round(width * dpr);
    if (c.height !== HEIGHT * dpr) c.height = HEIGHT * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, HEIGHT);
    const accent = cssVar("--accent", "#378add");
    const muted = cssVar("--muted", "#9aa3b2");
    const text = cssVar("--text", "#000");
    const guide = cssVar("--guide", "#e24b4a");
    const x = (ms: number) => (ms - start) * pxPerMs;

    // Waveform: the loudest bucket under each pixel.
    if (wave) {
      const mid = LABEL_H + (HEIGHT - LABEL_H) / 2;
      const half = (HEIGHT - LABEL_H) / 2 - 2;
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
      g.fillRect(Math.round(lx) - (on ? 1 : 0.5), LABEL_H, on ? 2 : 1, HEIGHT - LABEL_H);
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
    g.fillRect(Math.round(x(now)), 0, 2, HEIGHT);
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

  const msAt = (clientX: number) => start + (clientX - canvas.current!.getBoundingClientRect().left) / pxPerMs;

  const down = (e: PointerEvent) => {
    if (!wave) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ms = msAt(e.clientX);
    const near = marks.map((m) => ({ ...m, d: Math.abs(m.ms - ms) * pxPerMs })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= GRAB) {
      gesture.current = { kind: "line", point: near.p };
      setDrag({ key: markKey(near.p), ms: near.ms });
      onSelect(markKey(near.p));
      onPreview?.(near.ms);
    } else gesture.current = { kind: "pan", x: e.clientX, start, moved: false };
  };

  const move = (e: PointerEvent) => {
    const gs = gesture.current;
    if (!gs) return;
    if (gs.kind === "pan") {
      const dx = e.clientX - gs.x;
      if (Math.abs(dx) > 4) gs.moved = true;
      if (gs.moved) setStart(clampStart(gs.start - dx / pxPerMs));
      return;
    }
    // Between its neighbours in time, so marks never swap.
    const i = marks.findIndex((m) => m.p === gs.point);
    const lo = i > 0 ? marks[i - 1].ms + GAP : 0;
    const hi = i + 1 < marks.length ? marks[i + 1].ms - GAP : duration;
    const ms = Math.round(Math.max(lo, Math.min(hi, msAt(e.clientX))));
    setDrag({ key: markKey(gs.point), ms });
    onPreview?.(ms);
  };

  const up = (e: PointerEvent) => {
    const gs = gesture.current;
    gesture.current = null;
    if (gs?.kind === "line" && drag) {
      if (drag.ms !== gs.point.ms) onMove(gs.point, drag.ms);
      setDrag(null);
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

  return (
    <div className="space-y-1.5">
      <div ref={box} className="relative overflow-hidden rounded-xl bg-surface" style={{ height: HEIGHT }}>
        <canvas
          ref={canvas}
          style={{ width, height: HEIGHT, touchAction: "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="block cursor-crosshair"
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
