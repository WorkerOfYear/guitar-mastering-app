import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BookOpen, ChevronDown, ChevronRight, ListChecks, Download, Guitar, GraduationCap, Metronome, TrendingUp, Upload, type LucideIcon } from "lucide-react";
import { Button, Card, NumberField, Segmented, SectionTitle, Toggle } from "@/components/ui";
import { BLOCK_ICON } from "@/components/ui/icons";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Placeholder";
import { localDate } from "@/lib/date";
import { exportData, useData, type DataState } from "@/store/data";
import { useSettings } from "@/store/settings";
import { BLOCK_META, type BlockKind } from "@/shared/types";
import { SyncCard } from "./SyncCard";
import { AudioServerCard } from "./AudioServerCard";

const DAY_LABELS = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const SECTIONS: [string, string, LucideIcon][] = [
  ["/settings/plan", "Конструктор плана", ListChecks],
  ["/library", "Библиотека", BookOpen],
  ["/theory", "Теория", GraduationCap],
  ["/progress", "Прогресс", TrendingUp],
  ["/metronome", "Метроном", Metronome],
  ["/improv", "Импровизация", Guitar],
];

export function SettingsPage() {
  const { fretboard, setFretboard } = useSettings();
  const { practice, setPractice, replaceAll } = useData();
  const file = useRef<HTMLInputElement>(null);
  const [more, setMore] = useState(false);

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
      toast.success("Бэкап загружен", { description: `${data.items.length} элементов, ${data.sessions?.length ?? 0} занятий` });
    } catch {
      toast.error("Не удалось прочитать файл", { description: "Это точно бэкап этого приложения?" });
    }
  };

  return (
    <div>
      <PageHeader title="Настройки" />

      <SectionTitle>Разделы</SectionTitle>
      <Card className="divide-y divide-line/60 px-2 py-1">
        {SECTIONS.map(([to, label, Icon]) => (
          <Link key={to} to={to} onClick={haptic} className="flex h-14 items-center gap-3 rounded-xl px-2 transition-colors active:bg-surface-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <Icon className="size-5" />
            </span>
            <span className="flex-1 font-semibold">{label}</span>
            <ChevronRight className="size-4 text-muted" />
          </Link>
        ))}
      </Card>

      <SectionTitle>Занятие</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(practice.blocks) as BlockKind[]).map((k) => {
            const Icon = BLOCK_ICON[k];
            return (
              <NumberField
                key={k}
                label={
                  <span className="flex items-center gap-1">
                    <Icon className="size-3.5 text-accent" /> {BLOCK_META[k].title}, мин
                  </span>
                }
                value={practice.blocks[k]}
                onChange={(v) => setPractice({ blocks: { ...practice.blocks, [k]: v } })}
              />
            );
          })}
        </div>
        <div>
          <div className="pb-2 text-sm">Дни занятий</div>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = practice.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptic();
                    setPractice({ days: on ? practice.days.filter((x) => x !== d) : [...practice.days, d].sort() });
                  }}
                  className={cn(
                    "aspect-square rounded-full text-xs font-bold transition-[background-color,color,transform] active:scale-90",
                    on ? "bg-accent text-on-accent" : "bg-surface-2 text-muted",
                  )}
                >
                  {DAY_LABELS[d]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Нового за занятие" value={practice.maxNew} onChange={(maxNew) => setPractice({ maxNew })} />
          <NumberField
            label="Минут на повторение элемента"
            value={practice.minutesPerReview}
            onChange={(minutesPerReview) => setPractice({ minutesPerReview })}
          />
        </div>
      </Card>

      <button
        type="button"
        aria-expanded={more}
        onClick={() => {
          haptic();
          setMore((v) => !v);
        }}
        className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-muted transition-colors active:bg-surface-2"
      >
        {more ? "Скрыть остальные настройки" : "Остальные настройки"}
        <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
      </button>

      {more && (
        <>
          <SectionTitle>Гриф</SectionTitle>
          <Card>
            <div className="pb-2 text-sm">Количество ладов</div>
            <Segmented
              value={String(fretboard.frets)}
              onChange={(v) => setFretboard({ frets: Number(v) })}
              options={["12", "15", "17", "24"].map((v) => ({ value: v, label: v }))}
            />
            <Toggle label="Для левши" checked={fretboard.leftHanded} onChange={(v) => setFretboard({ leftHanded: v })} />
            <Toggle
              label="Ноты лада за пределами позиции"
              hint="Показывать их на грифе бледным цветом, чтобы видеть, как позиции соединяются"
              checked={fretboard.showOutside}
              onChange={(v) => setFretboard({ showOutside: v })}
            />
          </Card>

          <SectionTitle>Звук из YouTube</SectionTitle>
          <AudioServerCard />

          <SectionTitle>Синхронизация и Telegram</SectionTitle>
          <SyncCard />

          <SectionTitle>Бэкап</SectionTitle>
          <Card className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={download}>
                <Download className="size-4" /> Сохранить в файл
              </Button>
              <Button variant="secondary" onClick={() => file.current?.click()}>
                <Upload className="size-4" /> Загрузить
              </Button>
            </div>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </Card>
        </>
      )}
    </div>
  );
}
