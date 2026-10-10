import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import { PageHeader, SettingsLink } from "@/components/ui/Placeholder";

const BLOCKS = [
  { icon: "🔥", title: "Разминка", minutes: 10, hint: "Хроматика, паук, растяжки, легато, пентатоника" },
  { icon: "🧩", title: "Разбор нового", minutes: 20, hint: "Техника, кусок песни, лик или теория" },
  { icon: "🔁", title: "Повторение", minutes: 15, hint: "То, что дольше всего не играл" },
  { icon: "🎶", title: "Импровизация", minutes: 15, hint: "Тональность, ступени и лады под них" },
];

const DAYS = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const PRACTICE_DAYS = [1, 3, 6];

export function TodayPage() {
  const today = new Date().getDay();
  const isPracticeDay = PRACTICE_DAYS.includes(today);
  return (
    <div>
      <PageHeader title="Сегодня" action={<SettingsLink />} />
      <Card>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div
              key={d}
              className={`flex h-10 flex-1 items-center justify-center rounded-xl text-xs font-semibold ${
                PRACTICE_DAYS.includes(d) ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted"
              } ${d === today ? "ring-2 ring-accent" : ""}`}
            >
              {DAYS[d]}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          {isPracticeDay ? "Сегодня день занятия — 60 минут." : "Сегодня отдых. Следующее занятие по расписанию: ПН, СР, СБ."}
        </p>
      </Card>

      <h2 className="px-1 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-muted">План занятия</h2>
      <div className="space-y-2">
        {BLOCKS.map((b) => (
          <Card key={b.title} className="flex items-center gap-3">
            <span className="text-2xl">{b.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{b.title}</div>
              <div className="truncate text-xs text-muted">{b.hint}</div>
            </div>
            <span className="text-sm font-semibold text-muted">{b.minutes} мин</span>
          </Card>
        ))}
      </div>

      <button type="button" disabled className="mt-4 h-14 w-full rounded-2xl bg-accent text-base font-bold text-on-accent opacity-40">
        Начать занятие — скоро
      </button>
      <p className="mt-3 text-center text-sm text-muted">
        Пока готов справочник:{" "}
        <Link to="/theory" className="font-semibold text-accent">
          лады и аккорды на грифе →
        </Link>
      </p>
    </div>
  );
}
