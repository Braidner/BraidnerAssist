import { useEffect, useState } from "react";
import { useTheme } from "./theme.ts";
import {
  getTasks, toggleTask, createTask, getHermes, getServices, getWeather, getVersion,
  getHassAutomations, toggleHassAutomation,
  setUnauthorizedHandler,
  type PanelTask, type HermesData, type ServicesData, type WeatherData, type VersionData, type HassData,
} from "./lib/api.ts";
import { SettingsPanel } from "./components/panels/SettingsPanel.tsx";
import { LogsPanel } from "./components/LogsPanel.tsx";
import { getToken, clearToken } from "./lib/auth.ts";
import { LoginForm } from "./components/LoginForm.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { HermesChat } from "./components/HermesChat.tsx";
import { TopBar } from "./components/panels/TopBar.tsx";
import { StatStrip } from "./components/panels/StatStrip.tsx";
import { TasksPanel } from "./components/panels/Tasks.tsx";
import { SystemStatusPanel } from "./components/panels/SystemStatus.tsx";
import { HermesLogPanel } from "./components/panels/HermesLog.tsx";
import { HomeAssistantPanel } from "./components/panels/HomeAssistant.tsx";

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
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [hermes, setHermes] = useState<HermesData>({ configured: false, sessions: [] });
  const [servicesData, setServicesData] = useState<ServicesData>({ configured: false, services: [] });
  const [weather, setWeather] = useState<WeatherData>({ configured: false, current: null, forecast: [] });
  const [hass, setHass] = useState<HassData>({ configured: false, automations: [] });
  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!authed) return;

    fetch("/healthz")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));

    getTasks().then(setTasks);
    getHermes().then(setHermes);
    getServices().then(setServicesData);
    getWeather().then(setWeather);
    getHassAutomations().then(setHass);
    getVersion().then(setVersionData);

    const serviceTimer = setInterval(() => getServices().then(setServicesData), 60_000);
    const weatherTimer = setInterval(() => getWeather().then(setWeather), 1_800_000);
    const tasksTimer = setInterval(() => getTasks().then(setTasks), 300_000);
    const hassTimer = setInterval(() => getHassAutomations().then(setHass), 30_000);
    const hermesTimer = setInterval(() => getHermes().then(setHermes), 30_000);

    return () => {
      clearInterval(serviceTimer);
      clearInterval(weatherTimer);
      clearInterval(tasksTimer);
      clearInterval(hassTimer);
      clearInterval(hermesTimer);
    };
  }, [authed]);

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

  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <div className="mc" data-theme={theme}>
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSave={() => { setShowSettings(false); getServices().then(setServicesData); }}
        />
      )}
      {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
      <Drawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSessionStarted={(id) => {
          getHermes().then(setHermes);
          setSelectedTask(null);
          setOpenSessionId(id);
        }}
      />
      <HermesChat sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
      <div className="mc-shell">
        <TopBar clock={clock} backend={backend} theme={theme} onToggleTheme={toggle} onLogout={onLogout} onSettings={() => setShowSettings(true)} onLogs={() => setShowLogs(true)} versionData={versionData} />

        <StatStrip openTasks={openTasks} weather={weather} services={servicesData} hass={hass} />

        <div className="cols-3">
          <div className="col-fill">
            <TasksPanel tasks={tasks} onToggle={onToggleTask} onAdd={onAddTask} onSelect={onSelectTask} />
          </div>

          <div className="col">
            <SystemStatusPanel services={servicesData.services} configured={servicesData.configured} />
            <HomeAssistantPanel data={hass} onToggle={onToggleAutomation} />
          </div>

          <div className="col-fill">
            <HermesLogPanel data={hermes} onOpenSession={setOpenSessionId} />
          </div>
        </div>
      </div>
    </div>
  );
}
