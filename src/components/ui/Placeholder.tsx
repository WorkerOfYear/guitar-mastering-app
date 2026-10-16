import type { ReactNode } from "react";
import { HeaderNav } from "@/app/Nav";

/** A screen's title row; on a section's main screen it also carries the sections menu (wide screens). */
export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-4 pt-2">
      <div className="min-w-0">
        <h1 className="truncate text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <HeaderNav />
      </div>
    </header>
  );
}
