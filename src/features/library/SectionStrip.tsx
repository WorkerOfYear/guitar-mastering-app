import { useState } from "react";
import { Input, NumberField } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { useData } from "@/store/data";
import type { Item } from "@/shared/types";

/**
 * The song as a strip of its sections, each as long as its bars (equal parts while some have no bars).
 * Tapping a section shows its name and bars to edit; tapping it again hides them.
 */
export function SectionStrip({ item }: { item: Item }) {
  const { updateSection } = useData();
  const [picked, setPicked] = useState<string | null>(null);
  const sections = item.sections ?? [];
  if (!sections.length) return null;
  const byBars = sections.every((s) => s.bars);
  const section = sections.find((s) => s.id === picked);

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Разделы песни" className="flex h-9 gap-0.5">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === picked}
            title={s.title}
            onClick={() => {
              haptic();
              setPicked(s.id === picked ? null : s.id);
            }}
            style={{ flexGrow: byBars ? s.bars![1] - s.bars![0] + 1 : 1, flexBasis: 0 }}
            className={cn(
              "min-w-12 truncate px-1.5 text-xs font-semibold transition-colors",
              i === 0 && "rounded-l-xl",
              i === sections.length - 1 && "rounded-r-xl",
              s.id === picked ? "bg-accent text-on-accent" : "bg-surface-2 text-fg hover:bg-surface-2/70",
            )}
          >
            {s.title}
          </button>
        ))}
      </div>
      {section && (
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2/50 p-3">
          <label className="col-span-2 flex flex-col gap-1.5 text-[11px] font-medium text-muted">
            Название раздела
            <Input
              value={section.title}
              onChange={(e) => updateSection(item.id, section.id, { title: e.target.value })}
              className="h-11 rounded-xl text-base font-semibold"
            />
          </label>
          <NumberField
            label="С такта"
            min={0}
            value={section.bars?.[0] ?? 0}
            onChange={(v) => updateSection(item.id, section.id, { bars: v ? [v, Math.max(v, section.bars?.[1] ?? v)] : null })}
          />
          <NumberField
            label="По такт"
            min={0}
            value={section.bars?.[1] ?? 0}
            onChange={(v) => updateSection(item.id, section.id, { bars: v && section.bars ? [section.bars[0], Math.max(section.bars[0], v)] : section.bars })}
          />
        </div>
      )}
    </div>
  );
}
