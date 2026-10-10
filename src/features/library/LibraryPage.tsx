import { ComingSoon, PageHeader } from "@/components/ui/Placeholder";

export function LibraryPage() {
  return (
    <div>
      <PageHeader title="Библиотека" />
      <ComingSoon
        items={[
          "вкладки «В работе / Очередь / Ротация / Архив»",
          "техники, песни с разделами, лики и теория",
          "темп: текущий чистый и целевой, график роста",
          "стартовая библиотека под Paul Gilbert и The Doo",
        ]}
      />
    </div>
  );
}
