import { useEffect, useState } from "react";
import { useTheme } from "./theme.ts";
import {
  getTasks, toggleTask, createTask, getHermes, getServices, getWeather, getVersion,
  setUnauthorizedHandler,
  type PanelTask, type HermesData, type ServicesData, type WeatherData, type VersionData,
} from "./lib/api.ts";
import { getToken, clearToken } from "./lib/auth.ts";
import { LoginForm } from "./components/LoginForm.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { TopBar } from "./components/panels/TopBar.tsx";
import { StatStrip } from "./components/panels/StatStrip.tsx";
import { TasksPanel } from "./components/panels/Tasks.tsx";
import { HabitsPanel } from "./components/panels/Habits.tsx";
import { SystemStatusPanel } from "./components/panels/SystemStatus.tsx";
import { NotesPanel } from "./components/panels/Notes.tsx";
import { HermesLogPanel } from "./components/panels/HermesLog.tsx";
import { WeatherPanel } from "./components/panels/Weather.tsx";
import { Placeholder } from "./components/panels/Placeholder.tsx";

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
  const [servicesData, setServicesData] = useState<ServicesData>({ configured: false, services: [] });
  const [weather, setWeather] = useState<WeatherData>({ configured: false, current: null, forecast: [] });
  const [versionData, setVersionData] = useState<VersionData | null>(null);

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
    getVersion().then(setVersionData);

    const serviceTimer = setInterval(() => getServices().then(setServicesData), 60_000);
    const weatherTimer = setInterval(() => getWeather().then(setWeather), 1_800_000);
    const tasksTimer = setInterval(() => getTasks().then(setTasks), 300_000);

    return () => {
      clearInterval(serviceTimer);
      clearInterval(weatherTimer);
      clearInterval(tasksTimer);
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
      <Drawer task={selectedTask} onClose={() => setSelectedTask(null)} />
      <div className="mc-shell">
        <TopBar clock={clock} backend={backend} theme={theme} onToggleTheme={toggle} onLogout={onLogout} versionData={versionData} />

        <StatStrip openTasks={openTasks} hermesActions={hermes.log.length} />

        <div className="cols-3">
          <div className="col">
            <TasksPanel tasks={tasks} onToggle={onToggleTask} onAdd={onAddTask} onSelect={onSelectTask} />
            <Placeholder icon="calendar" title="Календарь" phase="Phase 3" />
          </div>

          <div className="col">
            <HabitsPanel />
            <WeatherPanel data={weather} />
            <NotesPanel />
          </div>

          <div className="col">
            <SystemStatusPanel services={servicesData.services} configured={servicesData.configured} />
            <Placeholder icon="home" title="Home Assistant" phase="Phase 4" />
            <HermesLogPanel data={hermes} />
          </div>
        </div>
      </div>
    </div>
  );
}
