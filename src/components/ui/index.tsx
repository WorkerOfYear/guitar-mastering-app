import type { ReactNode } from "react";
import { haptic } from "@/app/telegram";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-3xl border border-line bg-surface p-3", className)}>{children}</section>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex rounded-2xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            haptic();
            onChange(o.value);
          }}
          className={cx(
            "flex-1 rounded-xl font-medium transition-colors",
            size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
            value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, onClick, sub }: { active?: boolean; children: ReactNode; onClick?: () => void; sub?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic();
        onClick?.();
      }}
      className={cx(
        "flex shrink-0 flex-col items-center justify-center rounded-2xl border px-3.5 py-2 text-sm font-semibold leading-tight transition-colors",
        active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-fg",
      )}
    >
      {children}
      {sub && <span className={cx("text-[10px] font-normal", active ? "opacity-80" : "text-muted")}>{sub}</span>}
    </button>
  );
}

/** Horizontally scrolling row that bleeds to the screen edges. */
export function ScrollRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">{children}</div>;
}

export function IconButton({ children, onClick, label, disabled }: { children: ReactNode; onClick?: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic();
        onClick?.();
      }}
      className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-surface-2 px-3 text-lg font-semibold text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-7 w-12 rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-2")}
      >
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </button>
    </label>
  );
}
