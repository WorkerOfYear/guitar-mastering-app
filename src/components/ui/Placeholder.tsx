import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from ".";

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

/** Screens that are planned in the PRD but not built yet. */
export function ComingSoon({ items }: { items: string[] }) {
  return (
    <Card>
      <p className="text-sm text-muted">Этот экран появится в следующих версиях. Здесь будет:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Card>
  );
}
