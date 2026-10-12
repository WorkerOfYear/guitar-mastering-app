import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";

export function Switch({ className, onCheckedChange, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-2",
        className,
      )}
      onCheckedChange={(v) => {
        haptic();
        onCheckedChange?.(v);
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-6 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}
