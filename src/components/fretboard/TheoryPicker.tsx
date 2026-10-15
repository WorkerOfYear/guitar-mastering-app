import { Chip, ScrollRow, Segmented } from "@/components/ui";
import { CHORD_TYPES } from "@/music/chords";
import { SCALES } from "@/music/scales";
import { TONICS, noteName, parseNote } from "@/music/notes";
import type { TheoryLink } from "@/shared/types";

/** Pick what an exercise shows on the neck: a scale or a chord, and its tonic. */
export function TheoryPicker({ value, onChange }: { value: TheoryLink; onChange: (v: TheoryLink) => void }) {
  const set = (patch: Partial<TheoryLink>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-2">
      <Segmented
        size="sm"
        value={value.tab}
        onChange={(tab) => set({ tab, scaleId: value.scaleId ?? "minor-pentatonic", chordType: value.chordType ?? "maj7", diatonic: 0 })}
        options={[
          { value: "scale", label: "Лад или гамма" },
          { value: "chord", label: "Аккорд" },
        ]}
      />
      <ScrollRow>
        {TONICS.map((t) => (
          <Chip key={t} active={t === value.tonic} onClick={() => set({ tonic: t })}>
            {noteName(parseNote(t))}
          </Chip>
        ))}
      </ScrollRow>
      {value.tab === "scale" ? (
        <ScrollRow>
          {SCALES.map((s) => (
            <Chip key={s.id} active={s.id === value.scaleId} sub={s.group} onClick={() => set({ scaleId: s.id, diatonic: 0 })}>
              {s.name}
            </Chip>
          ))}
        </ScrollRow>
      ) : (
        <ScrollRow>
          {CHORD_TYPES.map((c) => (
            <Chip key={c.id} active={c.id === value.chordType} onClick={() => set({ chordType: c.id })}>
              {c.symbol || "maj"}
            </Chip>
          ))}
        </ScrollRow>
      )}
    </div>
  );
}

export const DEFAULT_BOARD: TheoryLink = { tab: "scale", tonic: "A", scaleId: "minor-pentatonic" };
