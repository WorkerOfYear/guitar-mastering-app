import { chordTypeById } from "./chords";
import { noteName, parseInterval, parseNote, transpose, TONICS } from "./notes";
import { scaleById } from "./scales";

/** A chord of a progression, written relative to the key: root interval + chord type + fitting scales. */
interface StepDef {
  root: string; // interval from the key tonic: "1", "b3", "5"
  type: string; // chord type id (chords.ts)
  bars?: number;
  /** Scales built on the chord root, best first */
  scales: string[];
}

export interface ProgressionDef {
  id: string;
  name: string;
  /** Mode the key is named in: "ля минор" vs "ля мажор" */
  minor: boolean;
  steps: StepDef[];
  /** One scale over the whole progression, built on `root` from the key tonic */
  overall: { root: string; scaleId: string }[];
}

const MAJ7_TONIC = ["ionian", "major-pentatonic", "lydian"];
const MAJ7_IV = ["lydian", "ionian", "major-pentatonic"];
const M7_II = ["dorian", "minor-pentatonic", "aeolian"];
const M7_VI = ["aeolian", "minor-pentatonic", "dorian"];
const DOM_MAJOR = ["mixolydian", "major-pentatonic", "altered"];
const DOM_MINOR = ["phrygian-dominant", "altered", "mixolydian"];
const DOM_BLUES = ["mixolydian", "blues", "minor-pentatonic"];

export const PROGRESSIONS: ProgressionDef[] = [
  {
    id: "ii-V-I",
    name: "ii – V – I",
    minor: false,
    steps: [
      { root: "2", type: "m7", scales: M7_II },
      { root: "5", type: "7", scales: DOM_MAJOR },
      { root: "1", type: "maj7", bars: 2, scales: MAJ7_TONIC },
    ],
    overall: [{ root: "1", scaleId: "ionian" }, { root: "1", scaleId: "major-pentatonic" }],
  },
  {
    id: "ii-V-i",
    name: "iiø – V – i (минорная)",
    minor: true,
    steps: [
      { root: "2", type: "m7b5", scales: ["locrian"] },
      { root: "5", type: "7", scales: DOM_MINOR },
      { root: "1", type: "m7", bars: 2, scales: ["aeolian", "dorian", "minor-pentatonic"] },
    ],
    overall: [{ root: "1", scaleId: "harmonic-minor" }, { root: "1", scaleId: "aeolian" }, { root: "1", scaleId: "minor-pentatonic" }],
  },
  {
    id: "I-vi-IV-V",
    name: "I – vi – IV – V",
    minor: false,
    steps: [
      { root: "1", type: "maj7", scales: MAJ7_TONIC },
      { root: "6", type: "m7", scales: M7_VI },
      { root: "4", type: "maj7", scales: MAJ7_IV },
      { root: "5", type: "7", scales: DOM_MAJOR },
    ],
    overall: [{ root: "1", scaleId: "ionian" }, { root: "1", scaleId: "major-pentatonic" }],
  },
  {
    id: "I-V-vi-IV",
    name: "I – V – vi – IV",
    minor: false,
    steps: [
      { root: "1", type: "maj", scales: MAJ7_TONIC },
      { root: "5", type: "maj", scales: ["mixolydian", "major-pentatonic"] },
      { root: "6", type: "m", scales: M7_VI },
      { root: "4", type: "maj", scales: MAJ7_IV },
    ],
    overall: [{ root: "1", scaleId: "major-pentatonic" }, { root: "1", scaleId: "ionian" }],
  },
  {
    id: "i-VI-III-VII",
    name: "i – ♭VI – ♭III – ♭VII",
    minor: true,
    steps: [
      { root: "1", type: "m", scales: ["aeolian", "minor-pentatonic"] },
      { root: "b6", type: "maj", scales: ["lydian", "major-pentatonic"] },
      { root: "b3", type: "maj", scales: ["ionian", "major-pentatonic"] },
      { root: "b7", type: "maj", scales: ["mixolydian", "major-pentatonic"] },
    ],
    overall: [{ root: "1", scaleId: "aeolian" }, { root: "1", scaleId: "minor-pentatonic" }],
  },
  {
    id: "i-iv-v",
    name: "i – iv – v",
    minor: true,
    steps: [
      { root: "1", type: "m7", scales: M7_VI },
      { root: "4", type: "m7", scales: M7_II },
      { root: "5", type: "m7", scales: ["phrygian", "minor-pentatonic"] },
    ],
    overall: [{ root: "1", scaleId: "aeolian" }, { root: "1", scaleId: "minor-pentatonic" }],
  },
  {
    id: "i-VII-VI-VII",
    name: "i – ♭VII – ♭VI – ♭VII",
    minor: true,
    steps: [
      { root: "1", type: "m", scales: ["aeolian", "minor-pentatonic"] },
      { root: "b7", type: "maj", scales: ["mixolydian", "major-pentatonic"] },
      { root: "b6", type: "maj", scales: ["lydian", "major-pentatonic"] },
      { root: "b7", type: "maj", scales: ["mixolydian", "major-pentatonic"] },
    ],
    overall: [{ root: "1", scaleId: "aeolian" }, { root: "1", scaleId: "minor-pentatonic" }],
  },
  {
    id: "dorian-vamp",
    name: "i7 – IV7 (дорийский вамп)",
    minor: true,
    steps: [
      { root: "1", type: "m7", bars: 2, scales: ["dorian", "minor-pentatonic"] },
      { root: "4", type: "7", bars: 2, scales: DOM_MAJOR },
    ],
    overall: [{ root: "1", scaleId: "dorian" }, { root: "1", scaleId: "minor-pentatonic" }],
  },
  {
    id: "lydian-vamp",
    name: "Imaj7 – II (лидийский вамп)",
    minor: false,
    steps: [
      { root: "1", type: "maj7", bars: 2, scales: ["lydian", "major-pentatonic"] },
      { root: "2", type: "maj", bars: 2, scales: ["mixolydian", "major-pentatonic"] },
    ],
    overall: [{ root: "1", scaleId: "lydian" }],
  },
  {
    id: "phrygian-vamp",
    name: "i – ♭II (фригийский вамп)",
    minor: true,
    steps: [
      { root: "1", type: "m", bars: 2, scales: ["phrygian", "minor-pentatonic"] },
      { root: "b2", type: "maj", bars: 2, scales: ["lydian", "major-pentatonic"] },
    ],
    overall: [{ root: "1", scaleId: "phrygian" }, { root: "1", scaleId: "phrygian-dominant" }],
  },
  {
    id: "harmonic-vamp",
    name: "i – V7 (гармонический минор)",
    minor: true,
    steps: [
      { root: "1", type: "m", bars: 2, scales: ["harmonic-minor", "aeolian", "minor-pentatonic"] },
      { root: "5", type: "7", bars: 2, scales: DOM_MINOR },
    ],
    overall: [{ root: "1", scaleId: "harmonic-minor" }],
  },
  {
    id: "blues-12",
    name: "12-тактовый блюз",
    minor: false,
    steps: [
      { root: "1", type: "7", bars: 4, scales: DOM_BLUES },
      { root: "4", type: "7", bars: 2, scales: DOM_BLUES },
      { root: "1", type: "7", bars: 2, scales: DOM_BLUES },
      { root: "5", type: "7", scales: DOM_BLUES },
      { root: "4", type: "7", scales: DOM_BLUES },
      { root: "1", type: "7", scales: DOM_BLUES },
      { root: "5", type: "7", scales: DOM_BLUES },
    ],
    overall: [{ root: "1", scaleId: "blues" }, { root: "1", scaleId: "minor-pentatonic" }, { root: "1", scaleId: "major-pentatonic" }],
  },
  {
    id: "rhythm-changes",
    name: "I – vi – ii – V (rhythm changes)",
    minor: false,
    steps: [
      { root: "1", type: "maj7", scales: MAJ7_TONIC },
      { root: "6", type: "m7", scales: M7_VI },
      { root: "2", type: "m7", scales: M7_II },
      { root: "5", type: "7", scales: DOM_MAJOR },
    ],
    overall: [{ root: "1", scaleId: "ionian" }, { root: "1", scaleId: "major-pentatonic" }],
  },
];

export const CHALLENGES = [
  "Целься в терцию аккорда на каждой смене",
  "Только легато: медиатор — одна нота на струну",
  "Только две соседние струны",
  "Только одна позиция пентатоники, без сдвигов",
  "Переходи по позициям: каждая фраза — новая позиция",
  "Фразы по 2 такта, между ними 2 такта паузы",
  "Используй лик из ротации и меняй его",
  "Только секстоли в стиле Гилберта",
  "Только восьмые, зато с бендами и вибрато",
  "Начинай каждую фразу не с сильной доли",
  "Сыграй арпеджио каждого аккорда, затем свяжи их",
  "Одна нота — но в разных ритмах (ритмическая импровизация)",
];

export const progressionById = (id: string) => PROGRESSIONS.find((p) => p.id === id) ?? PROGRESSIONS[0];

const spellFrom = (key: string, interval: string) => noteName(transpose(parseNote(key), parseInterval(interval)));
/** "Eb" → ASCII tonic id used by the theory module */
const toId = (name: string) => name.replace(/♭/g, "b").replace(/♯/g, "#");

export interface ResolvedChord {
  roman: string;
  rootId: string; // ASCII, e.g. "Bb"
  symbol: string; // "B♭m7"
  type: string;
  bars: number;
  scales: { rootId: string; scaleId: string; name: string }[];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const MINOR_TYPES = new Set(["m", "m7", "m7b5", "dim7", "m6", "m9", "mMaj7"]);

export function resolveProgression(key: string, progressionId: string) {
  const p = progressionById(progressionId);
  const chords: ResolvedChord[] = p.steps.map((s) => {
    const rootName = spellFrom(key, s.root);
    const rootId = toId(rootName);
    const type = chordTypeById(s.type);
    const iv = parseInterval(s.root);
    const numeral = ROMAN[(iv.degree - 1) % 7];
    const acc = iv.label.replace(/\d+/, "");
    const roman = acc + (MINOR_TYPES.has(s.type) ? numeral.toLowerCase() : numeral) + (s.type === "m7b5" ? "ø" : "");
    return {
      roman,
      rootId,
      symbol: rootName + type.symbol,
      type: s.type,
      bars: s.bars ?? 1,
      scales: s.scales.map((id) => ({ rootId, scaleId: id, name: `${rootName} ${scaleById(id).name.toLowerCase()}` })),
    };
  });
  const overall = p.overall.map((o) => {
    const rootName = spellFrom(key, o.root);
    return { rootId: toId(rootName), scaleId: o.scaleId, name: `${rootName} ${scaleById(o.scaleId).name.toLowerCase()}` };
  });
  return { progression: p, keyName: `${noteName(parseNote(key))} ${p.minor ? "минор" : "мажор"}`, chords, overall };
}

const pick = <T>(list: readonly T[], avoid: T[] = [], rnd = Math.random) => {
  const pool = list.filter((x) => !avoid.includes(x));
  const from = pool.length ? pool : list;
  return from[Math.floor(rnd() * from.length)];
};

/** New random task; the last few keys are avoided so practice spreads over the neck. */
export function randomTask(opts: { recentKeys?: string[]; lock?: { key?: string; progressionId?: string }; rnd?: () => number } = {}) {
  const rnd = opts.rnd ?? Math.random;
  return {
    key: opts.lock?.key ?? pick(TONICS, (opts.recentKeys ?? []).slice(-3) as (typeof TONICS)[number][], rnd),
    progressionId: opts.lock?.progressionId ?? pick(PROGRESSIONS, [], rnd).id,
    challenge: pick(CHALLENGES, [], rnd),
  };
}

const SCALE_EN: Record<string, string> = {
  "minor-pentatonic": "minor pentatonic",
  "major-pentatonic": "major pentatonic",
  blues: "blues",
  ionian: "major",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  aeolian: "minor",
  locrian: "locrian",
  "harmonic-minor": "harmonic minor",
  "melodic-minor": "melodic minor",
  "phrygian-dominant": "phrygian dominant",
  altered: "altered",
};

/** YouTube search for a backing track, e.g. "Bb dorian backing track". */
export const youtubeBackingUrl = (rootId: string, scaleId: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${rootId} ${SCALE_EN[scaleId] ?? scaleId} backing track`)}`;
