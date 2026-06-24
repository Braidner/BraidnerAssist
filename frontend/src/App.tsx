import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTheme } from "./theme.ts";
import {
  getTasks, toggleTask, createTask, deleteTask, getHermes, getHermesTasks, getServices, getWeather, getProxmox, getVersion,
  getHassAutomations, toggleHassAutomation, getDocker, getMetrics, getAdguard, getMedia,
  setUnauthorizedHandler,
  type PanelTask, type HermesData, type HermesTask, type ServicesData, type WeatherData, type ProxmoxData, type VersionData, type HassData, type DockerData, type UptimeSeries, type AdguardData, type MediaData,
} from "./lib/api.ts";
import { SettingsPanel } from "./components/panels/SettingsPanel.tsx";
import { LogsPanel } from "./components/LogsPanel.tsx";
import { getToken, clearToken } from "./lib/auth.ts";
import { LoginForm } from "./components/LoginForm.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopBar } from "./components/panels/TopBar.tsx";
import { StatStrip } from "./components/panels/StatStrip.tsx";
import { TasksPanel } from "./components/panels/Tasks.tsx";
import { HermesLogPanel } from "./components/panels/HermesLog.tsx";
import { HomeAssistantPanel } from "./components/panels/HomeAssistant.tsx";
import { HermesPage } from "./components/panels/HermesPage.tsx";
import { SystemPage } from "./components/panels/SystemPage.tsx";
import { MetricsPage } from "./components/panels/MetricsPage.tsx";
import { MediaPage } from "./components/panels/MediaPage.tsx";
import { MediaSeriesPage } from "./components/panels/MediaSeriesPage.tsx";
import { MediaMoviePage } from "./components/panels/MediaMoviePage.tsx";
import { MediaCalendarPage } from "./components/panels/MediaCalendarPage.tsx";
import { StubPage } from "./components/panels/StubPage.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";

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
  const [tasks, setTasks] = useState<PanelTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<PanelTask | null>(null);
  const [hermes, setHermes] = useState<HermesData>({ status: "idle", message: null, log: [] });
  const [hermesTasks, setHermesTasks] = useState<HermesTask[]>([]);
  const [servicesData, setServicesData] = useState<ServicesData>({ configured: false, services: [] });
  const [weather, setWeather] = useState<WeatherData>({ configured: false, current: null, forecast: [] });
  const [proxmox, setProxmox] = useState<ProxmoxData>({ configured: false, node: null, resource: null, vms: [] });
  const [docker, setDocker] = useState<DockerData>({ configured: false, containers: [] });
  const [metrics, setMetrics] = useState<UptimeSeries[]>([]);
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

    getTasks().then(setTasks);
    getHermes().then(setHermes);
    getHermesTasks().then(setHermesTasks);
    getServices().then(setServicesData);
    getWeather().then(setWeather);
    getProxmox().then(setProxmox);
    getDocker().then(setDocker);
    getMetrics().then(setMetrics);
    getAdguard().then(setAdguard);
    getMedia().then(setMedia);
    getHassAutomations().then(setHass);
    getVersion().then(setVersionData);

    const serviceTimer = setInterval(() => getServices().then(setServicesData), 60_000);
    const weatherTimer = setInterval(() => getWeather().then(setWeather), 1_800_000);
    const proxmoxTimer = setInterval(() => getProxmox().then(setProxmox), 30_000);
    const dockerTimer = setInterval(() => getDocker().then(setDocker), 30_000);
    const metricsTimer = setInterval(() => getMetrics().then(setMetrics), 60_000);
    const adguardTimer = setInterval(() => getAdguard().then(setAdguard), 30_000);
    const tasksTimer = setInterval(() => getTasks().then(setTasks), 300_000);
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
      clearInterval(metricsTimer);
      clearInterval(adguardTimer);
      clearInterval(tasksTimer);
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
  const onToggleTask = (task: PanelTask) => {
    if (task.tag === "gitlab") return;
    const done = !task.done;
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done } : x)));
    toggleTask(task.id, done).then((ok) => {
      if (!ok) setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done: !done } : x)));
    });
  };

  const onLogout = () => { clearToken(); setAuthed(false); };

  const onAddTask = (title: string) => {
    createTask(title).then((task) => {
      if (task) setTasks((ts) => [task, ...ts]);
    });
  };

  const onSelectTask = (task: PanelTask) => setSelectedTask(task);

  const onDeleteTask = (task: PanelTask) => {
    const prev = tasks;
    setTasks((ts) => ts.filter((x) => x.id !== task.id));
    if (selectedTask?.id === task.id) setSelectedTask(null);
    deleteTask(task.id).then((ok) => {
      if (!ok) setTasks(prev);
    });
  };

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

  // ── Render ────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="mc" data-theme={theme}>
        <LoginForm onSuccess={() => setAuthed(true)} />
      </div>
    );
  }

  const overview = (
    <>
      <StatStrip weather={weather} proxmox={proxmox} services={servicesData} />
      <div className="cols">
        <TasksPanel tasks={tasks} onToggle={onToggleTask} onAdd={onAddTask} onSelect={onSelectTask} onDelete={onDeleteTask} />
        <HomeAssistantPanel data={hass} onToggle={onToggleAutomation} />
        <HermesLogPanel data={hermes} tasks={hermesTasks} />
      </div>
    </>
  );

  return (
    <div className="mc" data-theme={theme}>
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSave={() => { setShowSettings(false); getServices().then(setServicesData); }}
        />
      )}
      {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
      <CommandPalette containers={docker.containers} adguard={adguard} onAddTask={onAddTask} />
      <Drawer task={selectedTask} onClose={() => setSelectedTask(null)} />

      <Sidebar open={sbOpen} onClose={() => setSbOpen(false)} onSettings={() => setShowSettings(true)} />

      <div className="main">
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

        <Routes>
          <Route path="/" element={overview} />
          <Route path="/tasks" element={
            <div className="page">
              <TasksPanel tasks={tasks} onToggle={onToggleTask} onAdd={onAddTask} onSelect={onSelectTask} onDelete={onDeleteTask} />
            </div>
          } />
          <Route path="/home-assistant" element={
            <div className="page">
              <HomeAssistantPanel data={hass} onToggle={onToggleAutomation} />
            </div>
          } />
          <Route path="/hermes" element={<HermesPage data={hermes} tasks={hermesTasks} />} />
          <Route path="/system" element={<SystemPage proxmox={proxmox} servicesData={servicesData} docker={docker} onDockerUpdate={setDocker} adguard={adguard} />} />
          <Route path="/metrics" element={<MetricsPage metrics={metrics} />} />
          <Route path="/media" element={<MediaPage media={media} onMediaUpdate={() => getMedia().then(setMedia)} />} />
          <Route path="/media/calendar" element={<MediaCalendarPage />} />
          <Route path="/media/series/:id" element={<MediaSeriesPage media={media} onMediaUpdate={() => getMedia().then(setMedia)} />} />
          <Route path="/media/movie/:id" element={<MediaMoviePage media={media} onMediaUpdate={() => getMedia().then(setMedia)} />} />
          <Route path="/media/discover/series/:id" element={<MediaSeriesPage media={media} onMediaUpdate={() => getMedia().then(setMedia)} source="discover" />} />
          <Route path="/media/discover/movie/:id" element={<MediaMoviePage media={media} onMediaUpdate={() => getMedia().then(setMedia)} source="discover" />} />
          <Route path="/notes" element={<StubPage icon="note" title="Заметки" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
