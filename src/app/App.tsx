import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { tg } from "./telegram";
import { BeatFlash } from "@/components/metronome/MetronomePanel";
import { TodayPage } from "@/features/today/TodayPage";
import { LibraryPage } from "@/features/library/LibraryPage";
import { ItemPage } from "@/features/library/ItemPage";
import { NewItemPage } from "@/features/library/NewItemPage";
import { TheoryPage } from "@/features/theory/TheoryPage";
import { ProgressPage } from "@/features/progress/ProgressPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { MetronomePage } from "@/features/metronome/MetronomePage";
import { ImprovPage } from "@/features/improv/ImprovPage";
import { SessionPage } from "@/features/session/SessionPage";

// One main screen for now; the others stay reachable from settings and from plan entries.
const TAB_ROOTS = ["/"];

/** Telegram's native back button for screens that are not tab roots. */
function TelegramBack() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!tg) return;
    const back = () => navigate(-1);
    if (TAB_ROOTS.includes(location.pathname) || location.pathname === "/session") tg.BackButton.hide();
    else tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg?.BackButton.offClick(back);
  }, [location.pathname, navigate]);
  return null;
}

/** In a normal browser: "← Назад" on every screen except home and the session (Telegram has its own button). */
function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  if (tg || location.pathname === "/" || location.pathname === "/session") return null;
  // Opened by a direct link there is no history to go back to — go home instead.
  const back = () => (location.key === "default" ? navigate("/") : navigate(-1));
  return (
    <button
      type="button"
      onClick={back}
      className="-ml-1 mb-1 flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-muted active:bg-surface-2"
    >
      ← Назад
    </button>
  );
}

/** Bot buttons open the app with ?page=theory etc. */
function StartPage() {
  const page = new URLSearchParams(window.location.search).get("page");
  return page && TAB_ROOTS.includes(`/${page}`) ? <Navigate to={`/${page}`} replace /> : <TodayPage />;
}

function Shell() {
  return (
    <>
      <TelegramBack />
      <main className="mx-auto max-w-3xl px-4 pb-10 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <BackButton />
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/library/new" element={<NewItemPage />} />
          <Route path="/library/:id" element={<ItemPage />} />
          <Route path="/theory" element={<TheoryPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/metronome" element={<MetronomePage />} />
          <Route path="/improv" element={<ImprovPage />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BeatFlash />
    </>
  );
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
