// Слой данных: реальные эндпоинты бэкенда + маппинг в форму, которую ждут панели.
// Каждый вызов изолирован — при ошибке возвращаем пустое/безопасное значение,
// чтобы одна нерабочая интеграция не роняла весь дашборд.

import { getToken, clearToken } from "./auth.ts";

// Fetch with JWT; fires onUnauthorized callback on 401 (token expired/invalid).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error("unauthorized");
  }
  return res;
}

export type Prio = "bad" | "warn" | "ok" | "info";

export interface PanelTask {
  id: string;
  label: string;
  done: boolean;
  prio: Prio;
  tag: string;
  hermes: boolean;
  claimedBy?: string | null;
  updatedAt: string;
  // GitLab detail fields (present when tag === "gitlab")
  webUrl?: string;
  descriptionText?: string | null;
  labels?: string[];
  projectRef?: string | null;
  iid?: number;
  kind?: "issue" | "mr";
  dueDate?: string | null;
  branchInfo?: string | null;
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

interface BackendTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  claimedBy?: string | null;
  updatedAt?: string;
  // GitLab-only extras
  webUrl?: string;
  descriptionText?: string | null;
  labels?: string[];
  projectRef?: string | null;
  iid?: number;
  kind?: "issue" | "mr";
  dueDate?: string | null;
  branchInfo?: string | null;
}

const PRIO_MAP: Record<string, Prio> = { high: "bad", medium: "warn", low: "info" };

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export async function getTasks(): Promise<PanelTask[]> {
  try {
    const res = await apiFetch("/api/tasks");
    if (!res.ok) return [];
    const tasks = (await res.json()) as BackendTask[];
    return tasks.map((t) => ({
      id: t.id,
      label: t.title,
      done: t.status === "done",
      prio: t.status === "done" ? "ok" : PRIO_MAP[t.priority] ?? "info",
      tag: t.source,
      hermes: t.source !== "local",
      claimedBy: t.claimedBy,
      updatedAt: t.updatedAt ?? new Date().toISOString(),
      webUrl: t.webUrl,
      descriptionText: t.descriptionText,
      labels: t.labels,
      projectRef: t.projectRef,
      iid: t.iid,
      kind: t.kind,
      dueDate: t.dueDate,
      branchInfo: t.branchInfo,
    }));
  } catch {
    return [];
  }
}

export async function toggleTask(id: string, done: boolean): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: done ? "done" : "todo" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createTask(title: string): Promise<PanelTask | null> {
  try {
    const res = await apiFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const t = (await res.json()) as BackendTask;
    return { id: t.id, label: t.title, done: false, prio: PRIO_MAP[t.priority] ?? "info", tag: t.source, hermes: false, updatedAt: t.updatedAt ?? new Date().toISOString() };
  } catch {
    return null;
  }
}

// ─── Services ────────────────────────────────────────────────────────

export interface ServiceConfig {
  name: string;
  url: string;
}

export interface ServiceStatus {
  name: string;
  status: "ok" | "warn" | "bad";
  tag: string;
}

export interface ServicesData {
  configured: boolean;
  services: ServiceStatus[];
}

export async function getServicesConfig(): Promise<ServiceConfig[]> {
  try {
    const res = await apiFetch("/api/settings/services");
    if (!res.ok) throw new Error();
    return (await res.json()) as ServiceConfig[];
  } catch {
    return [];
  }
}

export async function putServicesConfig(services: ServiceConfig[]): Promise<void> {
  const res = await apiFetch("/api/settings/services", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(services),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Save failed");
  }
}

export async function getServices(): Promise<ServicesData> {
  try {
    const res = await apiFetch("/api/services");
    if (!res.ok) throw new Error();
    const data = (await res.json()) as { configured: boolean; services?: ServiceStatus[] };
    return { configured: data.configured, services: data.services ?? [] };
  } catch {
    return { configured: false, services: [] };
  }
}

// ─── Weather ────────────────────────────────────────────────────────

export interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
}

export interface WeatherData {
  configured: boolean;
  current: { temp: number; code: number; wind: number } | null;
  forecast: WeatherDay[];
}

export async function getWeather(): Promise<WeatherData> {
  try {
    const res = await apiFetch("/api/weather");
    if (!res.ok) throw new Error();
    const data = (await res.json()) as { configured: boolean } & Partial<WeatherData>;
    return { configured: data.configured, current: data.current ?? null, forecast: data.forecast ?? [] };
  } catch {
    return { configured: false, current: null, forecast: [] };
  }
}

// ─── Proxmox ──────────────────────────────────────────────────────────

export interface ProxmoxResource {
  cpuPct: number;
  memUsed: number;
  memTotal: number;
  memPct: number;
  diskUsed: number;
  diskTotal: number;
  diskPct: number;
}

export interface ProxmoxVM {
  vmid: number;
  name: string;
  type: "qemu" | "lxc";
  status: "running" | "stopped";
  cpuPct: number;
  memPct: number;
}

export interface ProxmoxData {
  configured: boolean;
  node: string | null;
  resource: ProxmoxResource | null;
  vms: ProxmoxVM[];
}

export async function getProxmox(): Promise<ProxmoxData> {
  try {
    const res = await apiFetch("/api/proxmox");
    if (!res.ok) throw new Error();
    const data = (await res.json()) as { configured: boolean } & Partial<ProxmoxData>;
    return {
      configured: data.configured,
      node: data.node ?? null,
      resource: data.resource ?? null,
      vms: data.vms ?? [],
    };
  } catch {
    return { configured: false, node: null, resource: null, vms: [] };
  }
}

// ─── Version ────────────────────────────────────────────────────────

export interface VersionData {
  version: string;
  sha: string;
  latest: string | null;
  hasUpdate: boolean;
}

export async function getVersion(): Promise<VersionData> {
  try {
    const res = await fetch("/api/version");
    if (!res.ok) throw new Error();
    return (await res.json()) as VersionData;
  } catch {
    return { version: "—", sha: "???", latest: null, hasUpdate: false };
  }
}

// ─── Home Assistant ──────────────────────────────────────────────────

export interface HassAutomation {
  entityId: string;
  name: string;
  state: "on" | "off";
  lastTriggered: string | null;
}

export interface HassData {
  configured: boolean;
  automations: HassAutomation[];
}

export async function getHassAutomations(): Promise<HassData> {
  try {
    const res = await apiFetch("/api/homeassistant/automations");
    if (!res.ok) throw new Error();
    return (await res.json()) as HassData;
  } catch {
    return { configured: false, automations: [] };
  }
}

export async function toggleHassAutomation(entityId: string): Promise<boolean> {
  try {
    const res = await apiFetch("/api/homeassistant/automations/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId }),
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
      apiFetch("/api/hermes/status"),
      apiFetch("/api/hermes/log"),
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

// ── Hermes tasks (взятые в работу) ──────────────────────────────────────────────

export interface HermesTask {
  id: string;
  title: string;
  status: string;
  claimedAt: string | null;
  logCount: number;
  lastActivity: string | null;
}

export async function getHermesTasks(): Promise<HermesTask[]> {
  try {
    const res = await apiFetch("/api/hermes/tasks");
    return res.ok ? ((await res.json()) as HermesTask[]) : [];
  } catch {
    return [];
  }
}

// ── Hermes command queue ──────────────────────────────────────────────────────

export interface HermesCommand {
  id: string;
  command: string;
  status: string;
  result: string | null;
  createdAt: string;
}

export async function sendHermesCommand(command: string, payload?: unknown): Promise<HermesCommand | null> {
  try {
    const res = await apiFetch("/api/hermes/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, payload }),
    });
    return res.ok ? ((await res.json()) as HermesCommand) : null;
  } catch {
    return null;
  }
}

export async function getHermesCommands(): Promise<HermesCommand[]> {
  try {
    const res = await apiFetch("/api/hermes/commands");
    return res.ok ? ((await res.json()) as HermesCommand[]) : [];
  } catch {
    return [];
  }
}

export async function getTaskLogs(id: string): Promise<PanelLogLine[]> {
  try {
    const res = await apiFetch(`/api/tasks/${id}/logs`);
    if (!res.ok) return [];
    const raw = (await res.json()) as BackendAgentLog[];
    return raw.map((l) => ({
      t: timeOf(l.createdAt),
      msg: l.details ?? l.action,
      k: l.action,
      tag: l.result ?? "auto",
    }));
  } catch {
    return [];
  }
}

// ── Backend logs ──────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  t: string;
  level: LogLevel;
  ctx: string;
  msg: string;
  detail?: string;
}

export async function getLogs(): Promise<LogEntry[]> {
  try {
    const res = await apiFetch("/api/logs");
    if (!res.ok) return [];
    const body = (await res.json()) as { entries: LogEntry[] };
    return body.entries ?? [];
  } catch {
    return [];
  }
}

// ─── Docker ─────────────────────────────────────────────────────────

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

export interface DockerData {
  configured: boolean;
  containers: DockerContainer[];
}

export async function getDocker(): Promise<DockerData> {
  try {
    const res = await apiFetch("/api/docker/containers");
    if (!res.ok) throw new Error();
    return (await res.json()) as DockerData;
  } catch {
    return { configured: false, containers: [] };
  }
}

export async function dockerAction(id: string, action: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/docker/containers/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Metrics / Uptime ────────────────────────────────────────────────

export interface UptimeSample {
  status: string;
  latencyMs: number | null;
}

export interface UptimeSeries {
  name: string;
  uptime24h: number | null;
  uptime7d: number | null;
  avgLatency: number | null;
  samples: UptimeSample[];
}

export async function getMetrics(): Promise<UptimeSeries[]> {
  try {
    const res = await apiFetch("/api/metrics/uptime");
    if (!res.ok) return [];
    return (await res.json()) as UptimeSeries[];
  } catch {
    return [];
  }
}

// ─── AdGuard DNS ─────────────────────────────────────────────────────

export interface AdguardTop {
  domain: string;
  count: number;
}

export interface AdguardData {
  configured: boolean;
  dnsQueries: number;
  blocked: number;
  blockedPercent: number;
  avgProcessingMs: number;
  topBlocked: AdguardTop[];
}

const EMPTY_ADGUARD: AdguardData = {
  configured: false,
  dnsQueries: 0,
  blocked: 0,
  blockedPercent: 0,
  avgProcessingMs: 0,
  topBlocked: [],
};

export async function getAdguard(): Promise<AdguardData> {
  try {
    const res = await apiFetch("/api/adguard");
    if (!res.ok) return EMPTY_ADGUARD;
    return (await res.json()) as AdguardData;
  } catch {
    return EMPTY_ADGUARD;
  }
}

// ─── Media stack ─────────────────────────────────────────────────────

export interface NowPlaying {
  title: string;
  user: string;
  client: string;
  type: string;
  positionPct: number | null;
}

export interface DownloadItem {
  title: string;
  source: "sonarr" | "radarr" | "qbittorrent";
  progress: number;
  state: string;
}

export interface MediaData {
  configured: boolean;
  nowPlaying: NowPlaying[];
  downloads: DownloadItem[];
}

export async function getMedia(): Promise<MediaData> {
  try {
    const res = await apiFetch("/api/media");
    if (!res.ok) return { configured: false, nowPlaying: [], downloads: [] };
    return (await res.json()) as MediaData;
  } catch {
    return { configured: false, nowPlaying: [], downloads: [] };
  }
}
