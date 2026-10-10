import { ComingSoon, PageHeader } from "@/components/ui/Placeholder";

export function ProgressPage() {
  return (
    <div>
      <PageHeader title="Прогресс" />
      <ComingSoon
        items={[
          "цели: Technical Difficulties и Ascend на 100% темпа",
          "стрик недель, минуты в неделю, календарь занятий",
          "рекорды темпа и прогресс по техникам",
        ]}
      />
    </div>
  );
}
