import { useId, type ReactNode } from "react";
import { m } from "motion/react";
import { ToggleGroup } from "radix-ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Switch } from "./switch";

export { Button, buttonVariants } from "./button";
export { Card, CardDescription, CardHeader, CardTitle } from "./card";
export { Input, Textarea } from "./input";
export { Switch } from "./switch";
export { Slider } from "./slider";
export { Progress } from "./progress";
export { Badge } from "./badge";

/** Segmented control: one option out of a few, with a sliding highlight. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (!v) return; // keep one option selected
        haptic();
        onChange(v as T);
      }}
      className={cn("flex rounded-2xl bg-surface-2 p-1", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "relative flex flex-1 items-center justify-center gap-1.5 rounded-xl font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:size-4",
            size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
            value === o.value ? "text-fg" : "text-muted",
          )}
        >
          {value === o.value && (
            <m.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-xl bg-surface shadow-sm"
              transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">{o.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Chip({
  active,
  children,
  onClick,
  sub,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        haptic();
        onClick?.();
      }}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-2xl border px-3.5 py-2 text-sm font-semibold leading-tight outline-none transition-[background-color,border-color,color,transform] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/60",
        active ? "border-accent bg-accent text-on-accent shadow-[0_4px_14px_-6px_var(--accent)]" : "border-line bg-surface text-fg hover:bg-surface-2",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 [&_svg]:size-4">{children}</span>
      {sub && <span className={cn("text-[10px] font-normal", active ? "opacity-80" : "text-muted")}>{sub}</span>}
    </button>
  );
}

/** Horizontally scrolling row that bleeds to the screen edges. */
export function ScrollRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">{children}</div>;
}

export function IconButton({
  children,
  onClick,
  label,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("min-w-11 w-auto px-3", className)}
    >
      {children}
    </Button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 pb-2 pt-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <label htmlFor={id} className="min-w-0 flex-1 text-sm">
        {label}
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Number input with a small caption above. */
export function NumberField({ label, value, onChange, min = 1 }: { label: ReactNode; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="flex flex-col gap-1.5 text-[11px] font-medium text-muted">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min) onChange(v);
        }}
        className="h-11 rounded-xl border border-line bg-surface-2/60 px-3 text-base font-semibold tabular-nums text-fg outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent/20"
      />
    </label>
  );
}

/** Small stat: big number, caption under it. */
export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-surface-2/70 px-2 py-2.5 text-center", className)}>
      <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
      <div className="mt-0.5 text-[10px] leading-tight text-muted">{label}</div>
      {hint && <div className="text-[10px] leading-tight text-muted">{hint}</div>}
    </div>
  );
}
