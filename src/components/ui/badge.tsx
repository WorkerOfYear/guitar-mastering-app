import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5", {
  variants: {
    variant: {
      default: "bg-accent text-on-accent",
      soft: "bg-accent/15 text-accent",
      secondary: "bg-surface-2 text-muted",
      good: "bg-good/15 text-good",
      outline: "border border-line text-muted",
    },
  },
  defaultVariants: { variant: "secondary" },
});

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
