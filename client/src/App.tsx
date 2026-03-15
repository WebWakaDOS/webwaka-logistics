/**
 * App.tsx — Root application with routing, providers, and PWA setup [Part 6]
 * Blueprint: Mobile First, PWA First, Offline First, Africa First.
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./contexts/I18nContext";
import { OfflineBanner } from "./components/OfflineBanner";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import ParcelsList from "./pages/ParcelsList";
import CreateParcel from "./pages/CreateParcel";
import ParcelDetail from "./pages/ParcelDetail";
import PublicTracking from "./pages/PublicTracking";
import { useEffect } from "react";
import { initSyncEngine } from "./lib/syncEngine";
import { useAuth } from "./_core/hooks/useAuth";

// ─────────────────────────────────────────────────────────────────────────────
// Service Worker Registration [Part 6 — PWA First]
// ─────────────────────────────────────────────────────────────────────────────
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(reg => {
          // Background sync registration
          if ("sync" in reg) {
            (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync
              .register("ww-mutation-sync")
              .catch(() => {
                // Background sync not supported — graceful degradation
              });
          }
        })
        .catch(() => {
          // Service worker registration failed — app still works online
        });
    });
  }
}

registerServiceWorker();

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated Dashboard Layout wrapper
// ─────────────────────────────────────────────────────────────────────────────
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Engine Initialiser
// ─────────────────────────────────────────────────────────────────────────────
function SyncEngineInit() {
  useEffect(() => {
    const cleanup = initSyncEngine();
    return cleanup;
  }, []);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────
function Router() {
  return (
    <Switch>
      {/* Public tracking — no auth required */}
      <Route path="/track" component={PublicTracking} />

      {/* Authenticated routes wrapped in DashboardLayout */}
      <Route path="/">
        {() => (
          <AuthenticatedLayout>
            <Home />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/parcels">
        {() => (
          <AuthenticatedLayout>
            <ParcelsList />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/parcels/new">
        {() => (
          <AuthenticatedLayout>
            <CreateParcel />
          </AuthenticatedLayout>
        )}
      </Route>
      <Route path="/parcels/:trackingNumber">
        {() => (
          <AuthenticatedLayout>
            <ParcelDetail />
          </AuthenticatedLayout>
        )}
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App Root
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <I18nProvider>
          <TooltipProvider>
            <SyncEngineInit />
            <Toaster />
            <OfflineBanner />
            <Router />
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
