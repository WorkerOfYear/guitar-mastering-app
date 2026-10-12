import { Toaster as Sonner } from "sonner";

/** Toasts in the app's colors, above Telegram's bottom area. */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={{ top: "max(env(safe-area-inset-top), 12px)" }}
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border !border-line !bg-surface !text-fg !shadow-xl",
          description: "!text-muted",
        },
      }}
    />
  );
}
