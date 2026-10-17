import { Segmented } from "@/components/ui";
import type { TheoryLink } from "@/shared/types";
import { ChordSelect, ScaleSelect, TonicSelect } from "./TheorySelects";

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
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
        <TonicSelect value={value.tonic} onChange={(tonic) => set({ tonic })} />
        {value.tab === "scale" ? (
          <ScaleSelect value={value.scaleId ?? "minor-pentatonic"} onChange={(scaleId) => set({ scaleId, diatonic: 0 })} />
        ) : (
          <ChordSelect value={value.chordType ?? "maj7"} onChange={(chordType) => set({ chordType })} />
        )}
      </div>
    </div>
  );
}

export const DEFAULT_BOARD: TheoryLink = { tab: "scale", tonic: "A", scaleId: "minor-pentatonic" };
