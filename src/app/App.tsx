import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TabBar } from "./TabBar";
import { tg } from "./telegram";
import { TodayPage } from "@/features/today/TodayPage";
import { LibraryPage } from "@/features/library/LibraryPage";
import { TheoryPage } from "@/features/theory/TheoryPage";
import { ProgressPage } from "@/features/progress/ProgressPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

const TAB_ROOTS = ["/", "/library", "/theory", "/progress"];

/** Telegram's native back button for screens that are not tab roots. */
function TelegramBack() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!tg) return;
    const back = () => navigate(-1);
    if (TAB_ROOTS.includes(location.pathname)) tg.BackButton.hide();
    else tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg?.BackButton.offClick(back);
  }, [location.pathname, navigate]);
  return null;
}

/** Bot buttons open the app with ?page=theory etc. */
function StartPage() {
  const page = new URLSearchParams(window.location.search).get("page");
  return page && TAB_ROOTS.includes(`/${page}`) ? <Navigate to={`/${page}`} replace /> : <TodayPage />;
}

export function App() {
  return (
    <HashRouter>
      <TelegramBack />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/theory" element={<TheoryPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </HashRouter>
  );
}
