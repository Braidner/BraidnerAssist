import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTheme } from "./theme.ts";
import {
  getHermes, getHermesTasks, getServices, getWeather, getProxmox, getVersion,
  getHassAutomations, toggleHassAutomation, getDocker, getAdguard, getMedia,
  setUnauthorizedHandler,
  type HermesData, type HermesTask, type ServicesData, type WeatherData, type ProxmoxData, type VersionData, type HassData, type DockerData, type AdguardData, type MediaData,
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

  // ── UI state (always declared — Rules of Hooks) ───────────────────
  const [clock, setClock] = useState(() => new Date());
  const [backend, setBackend] = useState<Backend>("checking");
  const [hermes, setHermes] = useState<HermesData>({ status: "idle", message: null, log: [] });
  const [hermesTasks, setHermesTasks] = useState<HermesTask[]>([]);
  const [servicesData, setServicesData] = useState<ServicesData>({ configured: false, services: [] });
  const [weather, setWeather] = useState<WeatherData>({ configured: false, current: null, forecast: [] });
  const [proxmox, setProxmox] = useState<ProxmoxData>({ configured: false, node: null, resource: null, vms: [] });
  const [docker, setDocker] = useState<DockerData>({ configured: false, containers: [] });
  const [adguard, setAdguard] = useState<AdguardData>({ configured: false, dnsQueries: 0, blocked: 0, blockedPercent: 0, avgProcessingMs: 0, topBlocked: [] });
  const [media, setMedia] = useState<MediaData>({ configured: false, torrserver: false, tmdb: false, nowPlaying: [], downloads: [] });
  const [hass, setHass] = useState<HassData>({ configured: false, automations: [] });
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

    getHermes().then(setHermes);
    getHermesTasks().then(setHermesTasks);
    getServices().then(setServicesData);
    getWeather().then(setWeather);
    getProxmox().then(setProxmox);
    getDocker().then(setDocker);
    getAdguard().then(setAdguard);
    getMedia().then(setMedia);
    getHassAutomations().then(setHass);
    getVersion().then(setVersionData);

    const serviceTimer = setInterval(() => getServices().then(setServicesData), 60_000);
    const weatherTimer = setInterval(() => getWeather().then(setWeather), 1_800_000);
    const proxmoxTimer = setInterval(() => getProxmox().then(setProxmox), 30_000);
    const dockerTimer = setInterval(() => getDocker().then(setDocker), 30_000);
    const adguardTimer = setInterval(() => getAdguard().then(setAdguard), 30_000);
    const hassTimer = setInterval(() => getHassAutomations().then(setHass), 30_000);
    const hermesTimer = setInterval(() => {
      getHermes().then(setHermes);
      getHermesTasks().then(setHermesTasks);
    }, 60_000);

    return () => {
      clearInterval(serviceTimer);
      clearInterval(weatherTimer);
      clearInterval(proxmoxTimer);
      clearInterval(dockerTimer);
      clearInterval(adguardTimer);
      clearInterval(hassTimer);
      clearInterval(hermesTimer);
    };
  }, [authed]);

  // Адаптивный поллинг медиа: 5с при активной загрузке, иначе 15с.
  const dlActive = media.downloads.some(
    (d) => d.progress < 100 && !/paused|stopped|completed|error/i.test(d.state),
  );
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => getMedia().then(setMedia), dlActive ? 5_000 : 15_000);
    return () => clearInterval(t);
  }, [authed, dlActive]);

  // ── Handlers ─────────────────────────────────────────────────────
  const onLogout = () => { clearToken(); setAuthed(false); };

  const onToggleAutomation = (entityId: string) => {
    setHass((prev) => ({
      ...prev,
      automations: prev.automations.map((a) =>
        a.entityId === entityId ? { ...a, state: a.state === "on" ? "off" : "on" } : a
      ),
    }));
    toggleHassAutomation(entityId).then((ok) => {
      if (!ok) getHassAutomations().then(setHass);
    });
  };

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
            onSave={() => { setShowSettings(false); getServices().then(setServicesData); }}
          />
        )}
        {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
        <CommandPalette containers={docker.containers} adguard={adguard} />
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
            <Route path="/" element={
              <OverviewPage
                weather={weather}
                proxmox={proxmox}
                services={servicesData}
                hermes={hermes}
                hermesTasks={hermesTasks}
                hass={hass}
                onToggleAutomation={onToggleAutomation}
              />
            } />
            <Route path="/hermes" element={<HermesPage data={hermes} tasks={hermesTasks} />} />
            <Route path="/system" element={<SystemPage proxmox={proxmox} servicesData={servicesData} docker={docker} onDockerUpdate={setDocker} adguard={adguard} />} />
            <Route path="/media/*" element={<MediaRoutes media={media} onMediaUpdate={() => getMedia().then(setMedia)} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      </TasksProvider>
    </TabsProvider>
  );
}
