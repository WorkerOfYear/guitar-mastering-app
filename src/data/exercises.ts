import { buildPatterns } from "@/music/fretboard";
import { scaleTones } from "@/music/scales";

// Warm-up exercises written as alphaTex (alphaTab's text format), so they play like in Songsterr:
// tab on screen, a cursor that follows, guitar sound. In alphaTex a note is `fret.string`,
// where string 1 is the high e and 6 the low E.

const header = (title: string, tempo: number) => `\\title "${title}"\n\\tempo ${tempo}\n.\n\\track "Гитара"\n\\staff {tabs}\n\\ts 4 4\n`;

/** Split notes into bars of `perBar`; the duration is set once at the start. */
function body(tokens: string[], perBar: number, duration: string) {
  const bars: string[] = [];
  for (let i = 0; i < tokens.length; i += perBar) bars.push(tokens.slice(i, i + perBar).join(" "));
  return `:${duration} ${bars.join(" |\n")} |`;
}

const n = (fret: number, string: number) => `${fret}.${string}`;
const UP = [6, 5, 4, 3, 2, 1];
const DOWN = [1, 2, 3, 4, 5, 6];

/** 1-2-3-4 on every string, shifting up a fret each pass and changing direction. */
export function chromatic(tempo: number) {
  const t: string[] = [];
  for (let p = 1; p <= 8; p++) {
    const ascending = p % 2 === 1;
    for (const s of ascending ? UP : DOWN) for (const k of ascending ? [0, 1, 2, 3] : [3, 2, 1, 0]) t.push(n(p + k, s));
  }
  return header("Хроматика 1-2-3-4", tempo) + body(t, 16, "16");
}

/** Spider: fingers 1-3 on one string, 2-4 on the next, across all strings and back. */
export function spider(tempo: number) {
  const t: string[] = [];
  for (const p of [1, 3, 5, 7]) {
    const up: string[] = [];
    for (let s = 6; s >= 2; s--) up.push(n(p, s), n(p + 2, s), n(p + 1, s - 1), n(p + 3, s - 1));
    t.push(...up, ...[...up].reverse());
  }
  return header("Паук (spider)", tempo) + body(t, 16, "16");
}

/** Wide stretches (frets f, f+2, f+4, f+5) from the 12th fret down to the 5th. */
export function stretches(tempo: number) {
  const t: string[] = [];
  for (let f = 12, i = 0; f >= 5; f--, i++) {
    const ascending = i % 2 === 0;
    for (const s of ascending ? UP : DOWN) for (const d of ascending ? [0, 2, 4, 5] : [5, 4, 2, 0]) t.push(n(f + d, s));
  }
  return header("Растяжки", tempo) + body(t, 8, "8");
}

/** Hammer-on / pull-off triplets on each string: 5-7-9-9-7-5. */
export function legatoTriplets(tempo: number) {
  const t: string[] = [];
  for (const s of [...UP, ...DOWN]) {
    for (let r = 0; r < 2; r++) {
      t.push(...[5, 7].map((f) => `${n(f, s)}{h} {tu 3}`), `${n(9, s)} {tu 3}`);
      t.push(...[9, 7].map((f) => `${n(f, s)}{h} {tu 3}`), `${n(5, s)} {tu 3}`);
    }
  }
  return header("Легато-триоли", tempo) + body(t, 12, "8");
}

/** Minor pentatonic, all five boxes, up and down in sixteenths. */
export function pentatonicBoxes(tempo: number, tonic = "A") {
  const t: string[] = [];
  for (const box of buildPatterns(scaleTones(tonic, "minor-pentatonic"))) {
    const cells = [...box.cells]
      .map((k) => k.split(":").map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]); // low string first, then fret
    const up = cells.map(([s, f]) => n(f, 6 - s));
    const down = [...up].reverse();
    const loop = [...up, ...down];
    t.push(...loop, ...loop);
  }
  return header(`Пентатоника ${tonic}, 5 позиций`, tempo) + body(t, 16, "16");
}
