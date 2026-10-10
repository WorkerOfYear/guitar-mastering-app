import { describe, expect, it } from "vitest";
import { PROGRESSIONS, randomTask, resolveProgression } from "./improv";
import { scaleTones } from "./scales";
import { chordTones } from "./chords";
import { TONICS } from "./notes";

describe("improv", () => {
  it("resolves a minor ii–V–i in D", () => {
    const r = resolveProgression("D", "ii-V-i");
    expect(r.keyName).toBe("D минор");
    expect(r.chords.map((c) => c.symbol)).toEqual(["Em7♭5", "A7", "Dm7"]);
    expect(r.chords.map((c) => c.roman)).toEqual(["iiø", "V", "i"]);
    expect(r.chords[1].scales[0].name).toBe("A фригийский доминантовый");
  });
  it("spells flat keys", () => {
    const r = resolveProgression("Eb", "i-VI-III-VII");
    expect(r.chords.map((c) => c.symbol)).toEqual(["E♭m", "C♭", "G♭", "D♭"]);
    expect(r.chords[1].rootId).toBe("Cb");
  });
  it("every chord's scale suggestions contain the chord root and every progression resolves in all keys", () => {
    for (const key of TONICS) {
      for (const p of PROGRESSIONS) {
        const r = resolveProgression(key, p.id);
        for (const c of r.chords) {
          const root = chordTones(c.rootId, c.type)[0].chroma;
          for (const s of c.scales) expect(scaleTones(s.rootId, s.scaleId)[0].chroma).toBe(root);
        }
      }
    }
  });
  it("the overall scale fits the chord tones of diatonic progressions", () => {
    for (const id of ["ii-V-I", "I-vi-IV-V", "rhythm-changes", "i-iv-v", "i-VI-III-VII"]) {
      const r = resolveProgression("A", id);
      const scale = new Set(scaleTones(r.overall[0].rootId, r.overall[0].scaleId).map((t) => t.chroma));
      for (const c of r.chords) for (const t of chordTones(c.rootId, c.type)) expect(scale.has(t.chroma), `${id} ${c.symbol}`).toBe(true);
    }
  });
  it("avoids recent keys and honours locks", () => {
    let i = 0;
    const rnd = () => ((i++ * 0.37) % 1);
    for (let n = 0; n < 20; n++) expect(["C", "D", "E"]).not.toContain(randomTask({ recentKeys: ["C", "D", "E"], rnd }).key);
    expect(randomTask({ lock: { key: "F", progressionId: "blues-12" } })).toMatchObject({ key: "F", progressionId: "blues-12" });
  });
});
