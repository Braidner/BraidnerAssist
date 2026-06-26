import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTheme } from "./theme.ts";
import {
  getVersion,
  setUnauthorizedHandler,
  type VersionData,
} from "./lib/api.ts";
import { TabsProvider } from "./lib/tabsContext.tsx";
import { TasksProvider } from "./lib/tasksContext.tsx";
import { SettingsPanel } from "./components/overlays/SettingsPanel.tsx";
import { LogsPanel } from "./components/overlays/LogsPanel.tsx";
import { getToken, clearToken } from "./lib/auth.ts";
import { LoginForm } from "./components/overlays/LoginForm.tsx";
import { Drawer } from "./components/layout/Drawer.tsx";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { TopBar } from "./components/layout/TopBar.tsx";
import { HermesPage } from "./pages/system/HermesPage.tsx";
import { SystemPage } from "./pages/system/SystemPage.tsx";
import { MediaRoutes } from "./pages/media/MediaRoutes.tsx";
import { OverviewPage } from "./pages/overview/OverviewPage.tsx";
import { CommandPalette } from "./components/layout/CommandPalette.tsx";

type Backend = "up" | "down" | "checking";

export function App() {
  const { theme, toggle } = useTheme();

  // ── Auth ──────────────────────────────────────────────────────────
  const [authed, setAuthed] = useState(() => Boolean(getToken()));

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
  }, []);

  // ── UI state ──────────────────────────────────────────────────────
  const [clock, setClock] = useState(() => new Date());
  const [backend, setBackend] = useState<Backend>("checking");
  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [sbOpen, setSbOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sb-locked", sbOpen);
  }, [sbOpen]);

  useEffect(() => {
    if (!authed) return;

    fetch("/healthz")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));

    getVersion().then(setVersionData);
  }, [authed]);

  // ── Handlers ─────────────────────────────────────────────────────
  const onLogout = () => { clearToken(); setAuthed(false); };

  // ── Detail page check (hides TopBar) ─────────────────────────────
  const location = useLocation();
  const isDetailPage = /\/media\/(series|movie)\//.test(location.pathname);

  // ── Render ────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="mc" data-theme={theme}>
        <LoginForm onSuccess={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <TabsProvider>
      <TasksProvider>
      <div className="mc" data-theme={theme}>
        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onSave={() => setShowSettings(false)}
          />
        )}
        {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
        <CommandPalette />
        <Drawer />

        <Sidebar open={sbOpen} onClose={() => setSbOpen(false)} onSettings={() => setShowSettings(true)} />

        <div className="main">
          {!isDetailPage && (
            <TopBar
              clock={clock}
              backend={backend}
              theme={theme}
              onToggleTheme={toggle}
              onLogout={onLogout}
              onSettings={() => setShowSettings(true)}
              onLogs={() => setShowLogs(true)}
              onMenu={() => setSbOpen(true)}
              versionData={versionData}
            />
          )}

          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/hermes" element={<HermesPage />} />
            <Route path="/system" element={<SystemPage />} />
            <Route path="/media/*" element={<MediaRoutes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      </TasksProvider>
    </TabsProvider>
  );
}
