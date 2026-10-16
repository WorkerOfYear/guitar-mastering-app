import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { Button } from "./button";

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-4 pt-2">
      <div className="min-w-0">
        <h1 className="truncate text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      </div>
      {action}
    </header>
  );
}

export function SettingsLink({ className }: { className?: string }) {
  return (
    <Button asChild variant="secondary" size="icon" aria-label="Настройки" className={className}>
      <Link to="/settings">
        <Settings />
      </Link>
    </Button>
  );
}
