import type { ReactNode } from "react";

/** A screen's title row. On wide screens it leaves room on the right for the sections menu, which sits over it. */
export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-4 pt-2 md:pr-14">
      <div className="min-w-0">
        <h1 className="truncate text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
