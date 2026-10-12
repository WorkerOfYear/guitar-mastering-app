import type { ComponentProps, MouseEvent } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold outline-none transition-[transform,background-color,color,opacity,box-shadow] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-accent font-bold text-on-accent glow-accent hover:brightness-105",
        secondary: "bg-surface-2 text-fg hover:bg-surface-2/80",
        outline: "border border-line bg-transparent text-fg hover:bg-surface-2",
        dashed: "border border-dashed border-line bg-transparent text-fg hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        destructive: "bg-guide font-bold text-on-accent hover:brightness-105",
        "destructive-ghost": "text-guide hover:bg-guide/10",
        link: "h-auto rounded-md px-0 text-accent underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-10 rounded-xl px-3 text-sm",
        default: "h-12 px-4 text-sm",
        lg: "h-14 px-5 text-base",
        xl: "h-16 px-6 text-lg",
        icon: "size-11 text-base",
        "icon-sm": "size-9 rounded-xl text-sm",
        "icon-lg": "size-14 text-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

/** shadcn/ui button; a light Telegram haptic on every press. */
export function Button({ className, variant, size, asChild = false, onClick, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        haptic();
        onClick?.(e);
      }}
      {...props}
    />
  );
}
