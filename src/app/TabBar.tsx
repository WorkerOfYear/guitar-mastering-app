import { NavLink } from "react-router-dom";
import { haptic } from "./telegram";
import { useMetronome } from "@/store/metronome";

const TABS = [
  { to: "/", icon: "🎸", label: "Сегодня" },
  { to: "/library", icon: "📚", label: "Библиотека" },
  { to: "/theory", icon: "🎼", label: "Теория" },
  { to: "/progress", icon: "📈", label: "Прогресс" },
  { to: "/metronome", icon: "♩", label: "Метроном" },
];

export function TabBar() {
  const running = useMetronome((s) => s.running);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            onClick={haptic}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:justify-center [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:py-1.5 ${isActive ? "text-accent" : "text-muted"}`
            }
          >
            <span className="relative text-xl leading-none [@media(max-height:500px)]:text-base">
              {t.icon}
              {t.to === "/metronome" && running && <span className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />}
            </span>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
