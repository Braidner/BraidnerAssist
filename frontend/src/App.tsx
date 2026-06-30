import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTheme } from "./theme.ts";
import {
  getCurrentUser,
  getVersion,
  setUnauthorizedHandler,
  type VersionData,
} from "./lib/api.ts";
import { TabsProvider } from "./lib/tabsContext.tsx";
import { TasksProvider } from "./lib/tasksContext.tsx";
import { LogsPanel } from "./components/overlays/LogsPanel.tsx";
import { getToken, clearToken, type CurrentUser } from "./lib/auth.ts";
import { ui } from "./lib/ui.ts";
import { LoginForm } from "./components/overlays/LoginForm.tsx";
import { Drawer } from "./components/layout/Drawer.tsx";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { TopBar } from "./components/layout/TopBar.tsx";
import { HermesPage } from "./pages/system/HermesPage.tsx";
import { SystemPage } from "./pages/system/SystemPage.tsx";
import { MediaRoutes } from "./pages/media/MediaRoutes.tsx";
import { OverviewPage } from "./pages/overview/OverviewPage.tsx";
import { CommandPalette } from "./components/layout/CommandPalette.tsx";
import { SettingsPage } from "./pages/settings/SettingsPage.tsx";

type Backend = "up" | "down" | "checking";

export function App() {
  const { theme, toggle } = useTheme();

  // ── Auth ──────────────────────────────────────────────────────────
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
  }, []);

  // ── UI state ──────────────────────────────────────────────────────
  const [backend, setBackend] = useState<Backend>("checking");
  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [sbOpen, setSbOpen] = useState(false);

  useEffect(() => {
    const syncBodyLock = () => {
      document.body.classList.toggle(
        "sb-locked",
        sbOpen && window.matchMedia("(max-width: 53.75rem)").matches,
      );
    };

    syncBodyLock();
    window.addEventListener("resize", syncBodyLock);
    return () => {
      window.removeEventListener("resize", syncBodyLock);
      document.body.classList.remove("sb-locked");
    };
  }, [sbOpen]);

  useEffect(() => {
    if (!authed) return;

    getCurrentUser().then((current) => {
      if (current) setUser(current);
      else {
        clearToken();
        setAuthed(false);
      }
    });

    fetch("/healthz")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));

    getVersion().then(setVersionData);
  }, [authed]);

  // ── Handlers ─────────────────────────────────────────────────────
  const onLogout = () => {
    clearToken();
    setAuthed(false);
    setUser(null);
  };

  // ── Render ────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className={ui.shell} data-theme={theme}>
        <LoginForm
          onSuccess={(nextUser) => {
            setUser(nextUser);
            setAuthed(true);
          }}
        />
      </div>
    );
  }

  if (!user) {
    return <div className={ui.shell} data-theme={theme} />;
  }

  const role = user.role;

  return (
    <TabsProvider>
      <TasksProvider>
        <div className={ui.shell} data-theme={theme}>
          <LogsPanel open={showLogs} onOpenChange={setShowLogs} />
          <CommandPalette role={role} />
          <Drawer />

          <TopBar
            backend={backend}
            menuOpen={sbOpen}
            theme={theme}
            onToggleTheme={toggle}
            onLogout={onLogout}
            onMenu={() => setSbOpen((open) => !open)}
            versionData={versionData}
          />

          <div className={ui.content}>
            <Sidebar
              open={sbOpen}
              onClose={() => setSbOpen(false)}
              role={role}
            />

            <div id={"router-container"} className={ui.main}>
              <Routes>
                {role === "admin" && <Route path="/" element={<OverviewPage />} />}
                {role === "admin" && <Route path="/hermes" element={<HermesPage />} />}
                {role === "admin" && <Route path="/system" element={<SystemPage />} />}
                {role === "admin" && <Route path="/settings" element={<SettingsPage />} />}
                <Route
                  path="/media/*"
                  element={<MediaRoutes allowSystem={role === "admin"} />}
                />
                <Route
                  path="*"
                  element={<Navigate to={role === "media" ? "/media" : "/"} replace />}
                />
              </Routes>
            </div>
          </div>
        </div>
      </TasksProvider>
    </TabsProvider>
  );
}
