// Слой данных: реальные эндпоинты бэкенда + маппинг в форму, которую ждут панели.
// Каждый вызов изолирован — при ошибке возвращаем пустое/безопасное значение,
// чтобы одна нерабочая интеграция не роняла весь дашборд.

export type Prio = "bad" | "warn" | "ok" | "info";

export interface PanelTask {
  id: string;
  label: string;
  done: boolean;
  prio: Prio;
  tag: string;
  hermes: boolean;
}

export interface PanelLogLine {
  t: string;
  msg: string;
  k: string;
  tag: string;
}

export interface HermesData {
  status: "active" | "idle" | "error";
  message: string | null;
  log: PanelLogLine[];
}

// ─── backend shapes ────────────────────────────────────────────────
interface BackendTask {
  id: string;
  title: string;
  description: string | null;
  status: string; // todo | in_progress | done
  priority: string; // low | medium | high
  source: string;
}

interface BackendAgentStatus {
  status?: string;
  message?: string | null;
}

interface BackendAgentLog {
  id: string;
  action: string;
  details: string | null;
  result: string | null;
  createdAt: string;
}

const PRIO_MAP: Record<string, Prio> = { high: "bad", medium: "warn", low: "info" };

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export async function getTasks(): Promise<PanelTask[]> {
  try {
    const res = await fetch("/api/tasks");
    if (!res.ok) return [];
    const tasks = (await res.json()) as BackendTask[];
    return tasks.map((t) => ({
      id: t.id,
      label: t.title,
      done: t.status === "done",
      prio: t.status === "done" ? "ok" : PRIO_MAP[t.priority] ?? "info",
      tag: t.source,
      hermes: t.source !== "local",
    }));
  } catch {
    return [];
  }
}

export async function toggleTask(id: string, done: boolean): Promise<boolean> {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: done ? "done" : "todo" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getHermes(): Promise<HermesData> {
  const empty: HermesData = { status: "idle", message: null, log: [] };
  try {
    const [statusRes, logRes] = await Promise.all([
      fetch("/api/hermes/status"),
      fetch("/api/hermes/log"),
    ]);
    const status = statusRes.ok ? ((await statusRes.json()) as BackendAgentStatus) : {};
    const rawLog = logRes.ok ? ((await logRes.json()) as BackendAgentLog[]) : [];
    return {
      status: (status.status as HermesData["status"]) ?? "idle",
      message: status.message ?? null,
      log: rawLog.map((l) => ({
        t: timeOf(l.createdAt),
        msg: l.details ?? l.action,
        k: l.action,
        tag: l.result ?? "auto",
      })),
    };
  } catch {
    return empty;
  }
}
