import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { AccountTypeSync } from "@/components/account-type-sync";
import { ConvexReactClient } from "convex/react";
import { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "./types/global.d.ts";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Home = lazy(() => import("./pages/Home.tsx"));
const Missions = lazy(() => import("./pages/Missions.tsx"));
const MissionDetail = lazy(() => import("./pages/MissionDetail.tsx"));
const MissionCreate = lazy(() => import("./pages/MissionCreate.tsx"));
const MyMissions = lazy(() => import("./pages/MyMissions.tsx"));
const Applications = lazy(() => import("./pages/Applications.tsx"));
const Bookings = lazy(() => import("./pages/Bookings.tsx"));
const BookingDetail = lazy(() => import("./pages/BookingDetail.tsx"));
const Messages = lazy(() => import("./pages/Messages.tsx"));
const Wallet = lazy(() => import("./pages/Wallet.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Safety = lazy(() => import("./pages/Safety.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const AdminVerifications = lazy(() => import("./pages/AdminVerifications.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Chargement…</div>
    </div>
  );
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VlyToolbar />
    <InstrumentationProvider>
      <ConvexAuthProvider client={convex}>
        <AccountTypeSync />
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/accueil" />}
              />
              <Route path="/onboarding" element={<Onboarding />} />

              {/* Protected app routes */}
              <Route path="/accueil" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/missions" element={<RequireAuth><Missions /></RequireAuth>} />
              <Route path="/missions/create" element={<RequireAuth><MissionCreate /></RequireAuth>} />
              <Route path="/missions/:id" element={<RequireAuth><MissionDetail /></RequireAuth>} />
              <Route path="/mes-missions" element={<RequireAuth><MyMissions /></RequireAuth>} />
              <Route path="/candidatures" element={<RequireAuth><Applications /></RequireAuth>} />
              <Route path="/reservations" element={<RequireAuth><Bookings /></RequireAuth>} />
              <Route path="/reservations/:id" element={<RequireAuth><BookingDetail /></RequireAuth>} />
              <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
              <Route path="/messages/:id" element={<RequireAuth><Messages /></RequireAuth>} />
              <Route path="/portefeuille" element={<RequireAuth><Wallet /></RequireAuth>} />
              <Route path="/profil" element={<RequireAuth><Profile /></RequireAuth>} />
              <Route path="/securite" element={<RequireAuth><Safety /></RequireAuth>} />
              <Route path="/parametres" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth><AdminVerifications /></RequireAuth>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </InstrumentationProvider>
  </StrictMode>,
);
