import { Card, Segmented, SectionTitle, Toggle } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";
import { useSettings } from "@/store/settings";

export function SettingsPage() {
  const { fretboard, setFretboard } = useSettings();
  return (
    <div>
      <PageHeader title="Настройки" />
      <SectionTitle>Гриф</SectionTitle>
      <Card>
        <div className="pb-2 text-sm">Количество ладов</div>
        <Segmented
          value={String(fretboard.frets)}
          onChange={(v) => setFretboard({ frets: Number(v) })}
          options={[
            { value: "12", label: "12" },
            { value: "15", label: "15" },
            { value: "17", label: "17" },
            { value: "24", label: "24" },
          ]}
        />
        <Toggle label="Для левши" checked={fretboard.leftHanded} onChange={(v) => setFretboard({ leftHanded: v })} />
        <Toggle
          label="Показывать ноты вне позиции (приглушённо)"
          checked={fretboard.showOutside}
          onChange={(v) => setFretboard({ showOutside: v })}
        />
      </Card>
      <SectionTitle>Скоро</SectionTitle>
      <Card>
        <p className="text-sm text-muted">Длительности блоков, расписание и напоминания, синхронизация и Telegram-бот, бэкап.</p>
      </Card>
    </div>
  );
}
