// The app's background: faint strings and frets across the top of the screen, fading out downwards,
// over a soft accent glow. Fixed behind everything, never in the way of taps.

const STRINGS = [0, 1, 2, 3, 4, 5];
/** Fret wires across the width, closer together up the neck like on a guitar. */
const FRETS = Array.from({ length: 11 }, (_, n) => 12 + (376 * (1 - 0.88 ** n)) / (1 - 0.88 ** 10));

export function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh] [mask-image:linear-gradient(#000,transparent_75%)]"
      style={{ background: "radial-gradient(70% 55% at 50% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 75%)" }}
    >
      <svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="none">
        <g stroke="var(--text)" strokeOpacity={0.07}>
          {STRINGS.map((s) => (
            <line key={s} x1={0} x2={400} y1={60 + s * 28} y2={60 + s * 28} strokeWidth={0.6 + s * 0.3} vectorEffect="non-scaling-stroke" />
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
