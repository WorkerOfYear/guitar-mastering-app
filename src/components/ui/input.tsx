import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full min-w-0 rounded-2xl border border-line bg-surface-2/60 px-4 text-base text-fg outline-none transition-[border-color,box-shadow] placeholder:text-muted/80 focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldClass, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldClass, "py-3 text-sm", className)} {...props} />;
}
