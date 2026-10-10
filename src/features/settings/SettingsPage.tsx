import { useRef, useState } from "react";
import { NumberField } from "@/components/metronome/MetronomePanel";
import { Card, Chip, ScrollRow, Segmented, SectionTitle, Toggle } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";
import { localDate } from "@/lib/date";
import { exportData, useData, type DataState } from "@/store/data";
import { useSettings } from "@/store/settings";
import { BLOCK_META, type BlockKind } from "@/shared/types";

const DAY_LABELS = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];

export function SettingsPage() {
  const { fretboard, setFretboard } = useSettings();
  const { practice, setPractice, replaceAll } = useData();
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  const download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `guitar-backup-${localDate()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as DataState;
      if (!Array.isArray(data.items) || !Array.isArray(data.log)) throw new Error("bad");
      replaceAll(data);
      setMessage(`Загружено: ${data.items.length} элементов, ${data.sessions?.length ?? 0} занятий`);
    } catch {
      setMessage("Не удалось прочитать файл — это точно бэкап этого приложения?");
    }
  };

  return (
    <div>
      <PageHeader title="Настройки" />

      <SectionTitle>Занятие</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(practice.blocks) as BlockKind[]).map((k) => (
            <NumberField
              key={k}
              label={`${BLOCK_META[k].icon} ${BLOCK_META[k].title}, мин`}
              value={practice.blocks[k]}
              onChange={(v) => setPractice({ blocks: { ...practice.blocks, [k]: v } })}
            />
          ))}
        </div>
        <div>
          <div className="pb-2 text-sm">Дни занятий</div>
          <ScrollRow>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <Chip
                key={d}
                active={practice.days.includes(d)}
                onClick={() =>
                  setPractice({ days: practice.days.includes(d) ? practice.days.filter((x) => x !== d) : [...practice.days, d].sort() })
                }
              >
                {DAY_LABELS[d]}
              </Chip>
            ))}
          </ScrollRow>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Нового за занятие" value={practice.maxNew} onChange={(maxNew) => setPractice({ maxNew })} />
          <NumberField label="Минут на повторение элемента" value={practice.minutesPerReview} onChange={(minutesPerReview) => setPractice({ minutesPerReview })} />
        </div>
      </Card>

      <SectionTitle>Гриф</SectionTitle>
      <Card>
        <div className="pb-2 text-sm">Количество ладов</div>
        <Segmented
          value={String(fretboard.frets)}
          onChange={(v) => setFretboard({ frets: Number(v) })}
          options={["12", "15", "17", "24"].map((v) => ({ value: v, label: v }))}
        />
        <Toggle label="Для левши" checked={fretboard.leftHanded} onChange={(v) => setFretboard({ leftHanded: v })} />
        <Toggle label="Показывать ноты вне позиции (приглушённо)" checked={fretboard.showOutside} onChange={(v) => setFretboard({ showOutside: v })} />
      </Card>

      <SectionTitle>Данные</SectionTitle>
      <Card className="space-y-2">
        <p className="text-sm text-muted">Прогресс хранится на этом устройстве. Синхронизация через Telegram-бота появится позже — пока делай бэкап в файл.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={download} className="h-12 rounded-2xl bg-surface-2 text-sm font-semibold">
            💾 Сохранить в файл
          </button>
          <button type="button" onClick={() => file.current?.click()} className="h-12 rounded-2xl bg-surface-2 text-sm font-semibold">
            📂 Загрузить из файла
          </button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        {message && <p className="text-sm">{message}</p>}
      </Card>
    </div>
  );
}
