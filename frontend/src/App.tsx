import { useEffect, useState } from "react";
import { useTheme } from "./theme.ts";
import { getTasks, toggleTask, getHermes, type PanelTask, type HermesData } from "./lib/api.ts";
import { TopBar } from "./components/panels/TopBar.tsx";
import { StatStrip } from "./components/panels/StatStrip.tsx";
import { TasksPanel } from "./components/panels/Tasks.tsx";
import { HabitsPanel } from "./components/panels/Habits.tsx";
import { SystemStatusPanel } from "./components/panels/SystemStatus.tsx";
import { NotesPanel } from "./components/panels/Notes.tsx";
import { HermesLogPanel } from "./components/panels/HermesLog.tsx";
import { Placeholder } from "./components/panels/Placeholder.tsx";

type Backend = "up" | "down" | "checking";

export function App() {
  const { theme, toggle } = useTheme();
  const [clock, setClock] = useState(() => new Date());
  const [backend, setBackend] = useState<Backend>("checking");
  const [tasks, setTasks] = useState<PanelTask[]>([]);
  const [hermes, setHermes] = useState<HermesData>({ status: "idle", message: null, log: [] });

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch("/healthz")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));
    getTasks().then(setTasks);
    getHermes().then(setHermes);
  }, []);

  const onToggleTask = (task: PanelTask) => {
    const done = !task.done;
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done } : x)));
    toggleTask(task.id, done).then((ok) => {
      if (!ok) setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done: !done } : x)));
    });
  };

  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <div className="mc" data-theme={theme}>
      <div className="mc-shell">
        <TopBar clock={clock} backend={backend} theme={theme} onToggleTheme={toggle} />

        <StatStrip openTasks={openTasks} hermesActions={hermes.log.length} />

        <div className="cols-3">
          {/* колонка 1 — задачи (реальные) + календарь-плейсхолдер */}
          <div className="col">
            <TasksPanel tasks={tasks} onToggle={onToggleTask} />
            <Placeholder icon="calendar" title="Календарь" phase="Phase 3" />
          </div>

          {/* колонка 2 — привычки + погода-плейсхолдер + заметки */}
          <div className="col">
            <HabitsPanel />
            <Placeholder icon="cloud" title="Погода" phase="Phase 2" />
            <NotesPanel />
          </div>

          {/* колонка 3 — система + home assistant-плейсхолдер + лог Hermes */}
          <div className="col">
            <SystemStatusPanel />
            <Placeholder icon="home" title="Home Assistant" phase="Phase 4" />
            <HermesLogPanel data={hermes} />
          </div>
        </div>
      </div>
    </div>
  );
}
