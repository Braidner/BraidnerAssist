import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getTasks,
  toggleTask,
  createTask,
  deleteTask,
  type PanelTask,
} from "./api.ts";

interface TasksCtx {
  tasks: PanelTask[];
  selectedTask: PanelTask | null;
  clearSelection: () => void;
  onToggleTask: (task: PanelTask) => void;
  onAddTask: (title: string) => void;
  onSelectTask: (task: PanelTask) => void;
  onDeleteTask: (task: PanelTask) => void;
}

const Ctx = createContext<TasksCtx | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<PanelTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<PanelTask | null>(null);

  useEffect(() => {
    getTasks().then(setTasks);
    const t = setInterval(() => getTasks().then(setTasks), 300_000);
    return () => clearInterval(t);
  }, []);

  const onToggleTask = (task: PanelTask) => {
    if (task.tag === "gitlab") return;
    const done = !task.done;
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done } : x)));
    toggleTask(task.id, done).then((ok) => {
      if (!ok)
        setTasks((ts) =>
          ts.map((x) => (x.id === task.id ? { ...x, done: !done } : x)),
        );
    });
  };

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

  const clearSelection = () => setSelectedTask(null);

  return (
    <Ctx.Provider
      value={{
        tasks,
        selectedTask,
        clearSelection,
        onToggleTask,
        onAddTask,
        onSelectTask,
        onDeleteTask,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTasksCtx(): TasksCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTasksCtx must be used inside TasksProvider");
  return ctx;
}
