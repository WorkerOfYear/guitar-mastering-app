import { useEffect, useRef } from "react";

// The app's background: faint strings and frets across the top of the screen, fading out downwards,
// over a soft accent glow. Fixed behind everything, never in the way of taps.
// With a mouse, a string the pointer crosses is plucked: it shakes where it was crossed and settles down.

const W = 400;
const H = 300;
const STRINGS = [0, 1, 2, 3, 4, 5];
const stringY = (s: number) => 60 + s * 28;
/** Fret wires across the width, closer together up the neck like on a guitar. */
const FRETS = Array.from({ length: 11 }, (_, n) => 12 + (376 * (1 - 0.88 ** n)) / (1 - 0.88 ** 10));

const REST_OPACITY = 0.07;
/** How long a pluck rings, seconds (amplitude falls by e each DECAY) */
const DECAY = 0.45;
/** Visible wobbles per second */
const WOBBLE = 9;

interface Pluck {
  /** Where along the string, in board units */
  at: number;
  /** Size of the swing, board units */
  amp: number;
  start: number;
}

/** A plucked string's shape: a triangle peaking at the pluck, swinging and dying away. */
function path(y: number, p: Pluck | null, now: number) {
  if (!p) return `M0 ${y} L${W} ${y}`;
  const t = (now - p.start) / 1000;
  const swing = p.amp * Math.exp(-t / DECAY) * Math.cos(2 * Math.PI * WOBBLE * t);
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * W;
    const shape = x < p.at ? x / p.at : (W - x) / (W - p.at);
    pts.push(`${x.toFixed(1)} ${(y + swing * shape).toFixed(2)}`);
  }
  return `M${pts.join(" L")}`;
}

export function Backdrop() {
  const lines = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    // Only with a real mouse, and not for people who asked the system for less motion.
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const plucks: (Pluck | null)[] = STRINGS.map(() => null);
    let last: { x: number; y: number } | null = null;
    let frame = 0;

    const draw = () => {
      const now = performance.now();
      let ringing = false;
      STRINGS.forEach((s) => {
        const p = plucks[s];
        const el = lines.current[s];
        if (!el) return;
        const energy = p ? Math.exp(-(now - p.start) / 1000 / DECAY) : 0;
        if (p && energy < 0.02) plucks[s] = null;
        else if (p) ringing = true;
        el.setAttribute("d", path(stringY(s), plucks[s], now));
        // A ringing string shows a little more, then fades back with its swing.
        el.setAttribute("stroke-opacity", String(REST_OPACITY + 0.18 * energy * Math.min(1, Math.abs(p?.amp ?? 0) / 4)));
      });
      frame = ringing ? requestAnimationFrame(draw) : 0;
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      // Board units: the layer spans the width and the top 60% of the screen, stretched.
      const x = (e.clientX / window.innerWidth) * W;
      const y = (e.clientY / (window.innerHeight * 0.6)) * H;
      const prev = last;
      last = { x, y };
      if (!prev || Math.min(prev.y, y) > H) return;
      const speed = Math.hypot(x - prev.x, y - prev.y);
      for (const s of STRINGS) {
        const sy = stringY(s);
        if ((prev.y - sy) * (y - sy) > 0 || prev.y === y) continue;
        // Where the pointer crossed it, kept off the very ends so the triangle has a peak.
        const at = Math.min(W - 10, Math.max(10, prev.x + ((sy - prev.y) / (y - prev.y)) * (x - prev.x)));
        plucks[s] = { at, amp: Math.min(6, 1.5 + speed * 0.25) * Math.sign(y - prev.y), start: performance.now() };
      }
      if (!frame && plucks.some(Boolean)) frame = requestAnimationFrame(draw);
    };
    const leave = () => (last = null);

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh] [mask-image:linear-gradient(#000,transparent_75%)]"
      style={{ background: "radial-gradient(70% 55% at 50% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 75%)" }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <g stroke="var(--text)" fill="none">
          {STRINGS.map((s) => (
            <path
              key={s}
              ref={(el) => {
                lines.current[s] = el;
              }}
              d={path(stringY(s), null, 0)}
              strokeOpacity={REST_OPACITY}
              strokeWidth={0.6 + s * 0.3}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <g stroke="var(--text)" strokeOpacity={0.05} strokeWidth={1.5}>
          {FRETS.map((x) => (
            <line key={x} x1={x} x2={x} y1={48} y2={212} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
    </div>
  );
}
