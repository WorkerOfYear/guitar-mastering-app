import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { DropdownMenu } from "radix-ui";
import {
  BookOpen,
  Ellipsis,
  GraduationCap,
  Guitar,
  House,
  LayoutGrid,
  ListChecks,
  Metronome,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { haptic } from "./telegram";
import { cn } from "@/lib/utils";

// The app's sections: a bar at the bottom on phones, a "Разделы" menu next to settings on wide screens.

interface Section {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const SECTIONS: Section[] = [
  { to: "/", label: "Сегодня", icon: House },
  { to: "/library", label: "Библиотека", icon: BookOpen },
  { to: "/theory", label: "Теория", icon: GraduationCap },
  { to: "/metronome", label: "Метроном", icon: Metronome },
  { to: "/progress", label: "Прогресс", icon: TrendingUp },
  { to: "/improv", label: "Импровизация", icon: Guitar },
  { to: "/settings/plan", label: "Конструктор плана", icon: ListChecks },
  { to: "/settings", label: "Настройки", icon: Settings },
];

/** On the bottom bar; the rest are behind "Ещё". */
const BAR = SECTIONS.slice(0, 4);
const MORE = SECTIONS.slice(4);

/** Section roots: no back button there (in Telegram and in the browser). */
export const SECTION_ROOTS = SECTIONS.map((s) => s.to);

/** The section a path belongs to: the longest matching root ("/settings/plan" beats "/settings"). */
export function sectionOf(path: string) {
  return SECTIONS.filter((s) => (s.to === "/" ? path === "/" : path === s.to || path.startsWith(`${s.to}/`))).sort((a, b) => b.to.length - a.to.length)[0];
}

/** Phones: fixed bar at the bottom. Hidden during a session, which has its own controls there. */
export function BottomNav() {
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  if (pathname === "/session") return null;
  const current = sectionOf(pathname);
  const inMore = !!current && MORE.includes(current);
  return (
    <>
      <nav
        aria-label="Разделы"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {BAR.map((s) => (
            <BarItem key={s.to} to={s.to} icon={s.icon} label={s.label} active={current === s} />
          ))}
          <button
            type="button"
            onClick={() => {
              haptic();
              setMore(true);
            }}
            className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", inMore ? "text-accent" : "text-muted")}
          >
            <Ellipsis className="size-6" />
            {inMore ? current?.label : "Ещё"}
          </button>
        </div>
      </nav>
      <Drawer open={more} onOpenChange={setMore}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Разделы</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-1 pb-2">
            {MORE.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                onClick={() => {
                  haptic();
                  setMore(false);
                }}
                className={cn(
                  "flex h-14 items-center gap-3 rounded-2xl px-3 font-semibold transition-colors active:bg-surface-2",
                  current === s && "bg-surface-2",
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
                  <s.icon className="size-5" />
                </span>
                {s.label}
              </Link>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function BarItem({ to, icon: Icon, label, active }: { to: string; icon: LucideIcon; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      onClick={haptic}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-accent" : "text-muted")}
    >
      <Icon className="size-6" />
      <span className="max-w-full truncate px-1">{label}</span>
    </Link>
  );
}

/** Wide screens: a dropdown with every section. */
export function SectionsMenu() {
  const { pathname } = useLocation();
  const current = sectionOf(pathname);
  return (
    <DropdownMenu.Root>
      {/* No press-shrink here: the menu opens on press and is placed by the trigger, so a shrunken
          trigger made it jump a few pixels when the press ended. */}
      <DropdownMenu.Trigger asChild>
        {/* Icon only (the section's name is already the page title); while the list is open the square
            of the icon turns 45° into a diamond. */}
        <Button variant="secondary" size="icon" aria-label="Разделы" title="Разделы" className="group size-11 active:scale-100">
          <LayoutGrid className="!size-5 transition-transform duration-300 ease-out group-data-[state=open]:rotate-45" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-2xl border border-line bg-surface p-1.5 text-fg shadow-xl">
          {SECTIONS.map((s) => (
            <DropdownMenu.Item key={s.to} asChild>
              <Link
                to={s.to}
                className={cn(
                  "flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none data-[highlighted]:bg-surface-2",
                  current === s && "text-accent",
                )}
              >
                <s.icon className="size-4" />
                {s.label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
