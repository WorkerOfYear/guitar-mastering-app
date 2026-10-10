import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-3 pt-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function SettingsLink() {
  return (
    <Link to="/settings" aria-label="Настройки" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-xl">
      ⚙️
    </Link>
  );
}
