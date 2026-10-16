import { Suspense, lazy, useEffect, type ComponentType } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { LazyMotion, MotionConfig, m } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { tg } from "./telegram";
import { BeatFlash } from "@/components/metronome/MetronomePanel";
import { Button } from "@/components/ui";
import { Toaster } from "@/components/ui/sonner";
import { TodayPage } from "@/features/today/TodayPage";
import { BottomNav, SECTION_ROOTS, SectionsMenu } from "./Nav";

// Everything but the home screen loads on first visit, so the app opens fast inside Telegram.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const LibraryPage = page(() => import("@/features/library/LibraryPage"), "LibraryPage");
const ItemPage = page(() => import("@/features/library/ItemPage"), "ItemPage");
const NewExercisePage = page(() => import("@/features/library/NewExercisePage"), "NewExercisePage");
const NewPiecePage = page(() => import("@/features/library/NewPiecePage"), "NewPiecePage");
const TheoryPage = page(() => import("@/features/theory/TheoryPage"), "TheoryPage");
const ProgressPage = page(() => import("@/features/progress/ProgressPage"), "ProgressPage");
const SettingsPage = page(() => import("@/features/settings/SettingsPage"), "SettingsPage");
const PlanBuilderPage = page(() => import("@/features/settings/PlanBuilderPage"), "PlanBuilderPage");
const MetronomePage = page(() => import("@/features/metronome/MetronomePage"), "MetronomePage");
const ImprovPage = page(() => import("@/features/improv/ImprovPage"), "ImprovPage");
const SessionPage = page(() => import("@/features/session/SessionPage"), "SessionPage");

// Section roots (bottom bar / "Разделы" menu) have no back button.
const TAB_ROOTS = SECTION_ROOTS;

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
  if (tg || TAB_ROOTS.includes(location.pathname) || location.pathname === "/session") return null;
  // Opened by a direct link there is no history to go back to — go home instead.
  const back = () => (location.key === "default" ? navigate("/") : navigate(-1));
  return (
    <Button variant="ghost" size="sm" onClick={back} className="-ml-2 mb-1 gap-0.5 pl-1.5">
      <ChevronLeft />
      Назад
    </Button>
  );
}

/** Bot buttons open the app with ?page=theory etc. */
function StartPage() {
  const page = new URLSearchParams(window.location.search).get("page");
  return page && TAB_ROOTS.includes(`/${page}`) ? <Navigate to={`/${page}`} replace /> : <TodayPage />;
}

const motionFeatures = () => import("./motionFeatures").then((r) => r.default);

function Shell() {
  const location = useLocation();
  return (
    <LazyMotion features={motionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <TelegramBack />
        <main
          className={`mx-auto max-w-3xl px-4 pt-[max(env(safe-area-inset-top),0.5rem)] ${location.pathname === "/session" ? "pb-10" : "pb-28 md:pb-10"}`}
        >
          <div className="flex items-center gap-2">
            <BackButton />
            {/* Inner screens (a card, a form): the sections menu sits in the back row; main screens have it by the title. */}
            {location.pathname !== "/session" && !TAB_ROOTS.includes(location.pathname) && (
              <div className="ml-auto hidden pt-2 md:block">
                <SectionsMenu />
              </div>
            )}
          </div>
          {/* Opacity only: a transform here would break position: fixed inside the pages. */}
          <m.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: "easeOut" }}>
            <Suspense fallback={null}>
              <Routes location={location}>
                <Route path="/" element={<StartPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/library/new" element={<Navigate to="/library/new/exercise" replace />} />
                <Route path="/library/new/exercise" element={<NewExercisePage />} />
                <Route path="/library/new/piece" element={<NewPiecePage />} />
                <Route path="/library/:id" element={<ItemPage />} />
                <Route path="/theory" element={<TheoryPage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/plan" element={<PlanBuilderPage />} />
                <Route path="/metronome" element={<MetronomePage />} />
                <Route path="/improv" element={<ImprovPage />} />
                <Route path="/session" element={<SessionPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </m.div>
        </main>
        <BottomNav />
        <BeatFlash />
        <Toaster />
      </MotionConfig>
    </LazyMotion>
  );
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
