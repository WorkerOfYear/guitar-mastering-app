import type { ReactNode } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHORD_TYPES } from "@/music/chords";
import { SCALES } from "@/music/scales";
import { TONICS, noteName, parseNote } from "@/music/notes";

// Dropdowns for the tonic, the scale and the chord type (Theory screen and an exercise's neck).

const GROUPS = [...new Set(SCALES.map((s) => s.group))];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[11px] font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export function TonicSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Тональность">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="Тональность" className="w-full text-base font-semibold text-fg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TONICS.map((t) => (
            <SelectItem key={t} value={t}>
              {noteName(parseNote(t))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ScaleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Лад">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="Лад" className="w-full text-base font-semibold text-fg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GROUPS.map((g) => (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {SCALES.filter((s) => s.group === g).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ChordSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Аккорд">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="Аккорд" className="w-full text-base font-semibold text-fg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHORD_TYPES.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.symbol || "maj"} — {c.name.toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
