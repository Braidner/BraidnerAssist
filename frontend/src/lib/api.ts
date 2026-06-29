// Слой данных: реальные эндпоинты бэкенда + маппинг в форму, которую ждут панели.
// Каждый вызов изолирован — при ошибке возвращаем пустое/безопасное значение,
// чтобы одна нерабочая интеграция не роняла весь дашборд.

import { getToken, clearToken } from "./auth.ts";

// Fetch with JWT; fires onUnauthorized callback on 401 (token expired/invalid).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

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

const PRIO_MAP: Record<string, Prio> = {
  high: "bad",
  medium: "warn",
  low: "info",
};

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
      prio: t.status === "done" ? "ok" : (PRIO_MAP[t.priority] ?? "info"),
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
    return {
      id: t.id,
      label: t.title,
      done: false,
      prio: PRIO_MAP[t.priority] ?? "info",
      tag: t.source,
      hermes: false,
      updatedAt: t.updatedAt ?? new Date().toISOString(),
    };
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

export async function putServicesConfig(
  services: ServiceConfig[],
): Promise<void> {
  const res = await apiFetch("/api/settings/services", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(services),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Save failed");
  }
}

export async function getServices(): Promise<ServicesData> {
  try {
    const res = await apiFetch("/api/services");
    if (!res.ok) throw new Error();
    const data = (await res.json()) as {
      configured: boolean;
      services?: ServiceStatus[];
    };
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
    const data = (await res.json()) as {
      configured: boolean;
    } & Partial<WeatherData>;
    return {
      configured: data.configured,
      current: data.current ?? null,
      forecast: data.forecast ?? [],
    };
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
    const data = (await res.json()) as {
      configured: boolean;
    } & Partial<ProxmoxData>;
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
    const status = statusRes.ok
      ? ((await statusRes.json()) as BackendAgentStatus)
      : {};
    const rawLog = logRes.ok
      ? ((await logRes.json()) as BackendAgentLog[])
      : [];
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

export async function sendHermesCommand(
  command: string,
  payload?: unknown,
): Promise<HermesCommand | null> {
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

export async function dockerAction(
  id: string,
  action: string,
): Promise<boolean> {
  try {
    const res = await apiFetch(
      `/api/docker/containers/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
      },
    );
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

// Включить/выключить DNS-фильтрацию AdGuard. durationMs=0 → бессрочно.
export async function adguardProtection(
  enabled: boolean,
  durationMs = 0,
): Promise<boolean> {
  try {
    const res = await apiFetch("/api/adguard/protection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, durationMs }),
    });
    return res.ok;
  } catch {
    return false;
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
  hash: string;
  title: string;
  source: "qbittorrent";
  progress: number;
  state: string;
  dlspeed?: number;
  eta?: number | null;
  seeds?: number;
  size?: number;
  contentType?: "movie" | "series";
  downloadId?: string;
  importPending?: boolean;
  importMessage?: string;
}

export interface ManualImportEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}
export interface ManualImportFile {
  id: number;
  path: string;
  relativePath: string;
  folderName?: string | null;
  size: number;
  quality: string | null;
  languages: string[];
  releaseGroup?: string | null;
  seasonNumber: number | null;
  episodes?: ManualImportEpisode[];
  episodeNumbers?: number[];
  movieTitle?: string | null;
  rejections: string[];
}

export interface MediaData {
  configured: boolean;
  torrserver: boolean;
  tmdb: boolean;
  nowPlaying: NowPlaying[];
  downloads: DownloadItem[];
}

export async function getMedia(): Promise<MediaData> {
  try {
    const res = await apiFetch("/api/media");
    if (!res.ok)
      return {
        configured: false,
        torrserver: false,
        tmdb: false,
        nowPlaying: [],
        downloads: [],
      };
    return (await res.json()) as MediaData;
  } catch {
    return {
      configured: false,
      torrserver: false,
      tmdb: false,
      nowPlaying: [],
      downloads: [],
    };
  }
}

export interface MediaQualityProfile {
  name: string;
  kind: "movie" | "series" | "both";
  minResolution: number;
  maxResolution: number;
  preferHdr: boolean;
  allowHdr: boolean;
  allowHevc: boolean;
  allowAv1: boolean;
  preferredLanguages: string[];
  bannedWords: string[];
  maxMovieSizeGb: number | null;
  maxEpisodeSizeGb: number | null;
}

export interface JackettHealth {
  id: string;
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  resultCount: number;
  lastError: string | null;
  checkedAt: string | null;
}

export interface MediaRepairState {
  jackett: JackettHealth[];
  torrents: {
    infohash: string;
    title: string;
    contentType: "movie" | "series";
    importStatus: string;
    progress: number;
    lastError: string | null;
    files: { fileIndex: number; path: string; error: string | null; importedPath: string | null }[];
  }[];
  missing: {
    monitorId: string;
    title: string;
    seasonNumber: number;
    episodeNumber: number;
    airDate: string | null;
    status: string;
  }[];
}

export async function getMediaQualityProfiles(): Promise<MediaQualityProfile[]> {
  try {
    const res = await apiFetch("/api/media/quality-profiles");
    if (!res.ok) return [];
    return (await res.json()) as MediaQualityProfile[];
  } catch {
    return [];
  }
}

export async function getJackettHealth(force = false): Promise<JackettHealth[]> {
  try {
    const res = await apiFetch(`/api/media/jackett/health${force ? "?force=1" : ""}`);
    if (!res.ok) return [];
    return (await res.json()) as JackettHealth[];
  } catch {
    return [];
  }
}

export async function getMediaRepair(): Promise<MediaRepairState | null> {
  try {
    const res = await apiFetch("/api/media/repair");
    if (!res.ok) return null;
    return (await res.json()) as MediaRepairState;
  } catch {
    return null;
  }
}

// ── Media v2: TMDB дискавери ────────────────────────────────────────────
export interface TmdbItem {
  kind: "movie" | "series";
  tmdbId: number;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  genreIds: number[];
  genres?: string[];
  runtime?: number | null;
  episodeCount?: number | null;
  trailerKey?: string | null;
  trailerUrl?: string | null;
  rating: number | null;
}

export type MediaPreferenceStatus = "watchlist" | "hidden" | "liked" | "disliked";

export interface MediaPreference {
  id: string;
  kind: "movie" | "series";
  tmdbId: number;
  tvdbId: number | null;
  status: MediaPreferenceStatus;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: number | null;
  overview: string;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface DiscoverRail {
  key: string;
  label: string;
  kind: "movie" | "series" | "mixed";
  items: TmdbItem[];
}

export interface DiscoverHome {
  configured: boolean;
  hero: TmdbItem | null;
  genres: { movie: Genre[]; series: Genre[] };
  rails: DiscoverRail[];
}

export async function tmdbSearch(q: string): Promise<TmdbItem[]> {
  try {
    const res = await apiFetch(
      `/api/media/tmdb/search?q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as TmdbItem[];
  } catch {
    return [];
  }
}

// kind пусто → тренды недели (микс); "movie"/"series" → популярное по типу.
export async function tmdbTrending(
  kind?: "movie" | "series",
): Promise<TmdbItem[]> {
  try {
    const res = await apiFetch(
      `/api/media/tmdb/trending${kind ? `?kind=${kind}` : ""}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as TmdbItem[];
  } catch {
    return [];
  }
}

// tmdbId сериала → tvdbId (для перехода в карточку сериала).
export async function tmdbResolveTvdb(tmdbId: number): Promise<number | null> {
  try {
    const res = await apiFetch(`/api/media/tmdb/resolve?tmdbId=${tmdbId}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { tvdbId: number | null };
    return body.tvdbId ?? null;
  } catch {
    return null;
  }
}

// ── Discover (LAMPA/ZONA-style подборки) ───────────────────────────────
export interface DiscoverGenreOpts {
  year?: number | string;
  sort?: string;
  page?: number;
}

// Домашняя страница дискавери (hero + жанры + рейлы) одним вызовом.
export async function getDiscoverRails(): Promise<DiscoverHome> {
  const empty: DiscoverHome = {
    configured: false,
    hero: null,
    genres: { movie: [], series: [] },
    rails: [],
  };
  try {
    const res = await apiFetch("/api/media/discover/rails");
    if (!res.ok) return empty;
    return (await res.json()) as DiscoverHome;
  } catch {
    return empty;
  }
}

// Жанровый хаб: страница каталога (бесконечный скролл).
export async function getDiscoverGenre(
  kind: "movie" | "series",
  genreId: number,
  opts: DiscoverGenreOpts = {},
): Promise<TmdbItem[]> {
  try {
    const qs = new URLSearchParams();
    if (opts.year) qs.set("year", String(opts.year));
    if (opts.sort) qs.set("sort", opts.sort);
    if (opts.page) qs.set("page", String(opts.page));
    const res = await apiFetch(`/api/media/discover/genre/${kind}/${genreId}?${qs}`);
    if (!res.ok) return [];
    return (await res.json()) as TmdbItem[];
  } catch {
    return [];
  }
}

// Список жанров (ru) по типу — для чипов/фильтров жанрового хаба.
export async function getDiscoverGenres(kind: "movie" | "series"): Promise<Genre[]> {
  try {
    const res = await apiFetch(`/api/media/discover/genres?kind=${kind}`);
    if (!res.ok) return [];
    return (await res.json()) as Genre[];
  } catch {
    return [];
  }
}

// «Похожее» для детальной страницы. idType="tvdb" для сериала по tvdbId.
export async function getDiscoverSimilar(
  kind: "movie" | "series",
  id: number,
  idType: "tmdb" | "tvdb" = "tmdb",
): Promise<TmdbItem[]> {
  try {
    const res = await apiFetch(`/api/media/discover/similar/${kind}/${id}?idType=${idType}`);
    if (!res.ok) return [];
    return (await res.json()) as TmdbItem[];
  } catch {
    return [];
  }
}

// «Потому что вы смотрели» — персональные рейлы.
export async function getDiscoverBecause(): Promise<DiscoverRail[]> {
  try {
    const res = await apiFetch("/api/media/discover/because");
    if (!res.ok) return [];
    return (await res.json()) as DiscoverRail[];
  } catch {
    return [];
  }
}

// Франшиза (коллекция) фильма по tmdbId. null если не в коллекции (204).
export async function getDiscoverCollection(
  tmdbId: number,
): Promise<{name: string; items: TmdbItem[]} | null> {
  try {
    const res = await apiFetch(`/api/media/discover/collection/${tmdbId}`);
    if (res.status === 204 || !res.ok) return null;
    return (await res.json()) as {name: string; items: TmdbItem[]};
  } catch {
    return null;
  }
}

export async function getTmdbDetail(
  kind: "movie" | "series",
  id: number,
  idType: "tmdb" | "tvdb" = "tmdb",
): Promise<TmdbItem | null> {
  try {
    const res = await apiFetch(`/api/media/discover/tmdb-detail/${kind}/${id}?idType=${idType}`);
    if (!res.ok) return null;
    return (await res.json()) as TmdbItem;
  } catch {
    return null;
  }
}

export async function getMediaPreferences(status?: MediaPreferenceStatus): Promise<MediaPreference[]> {
  try {
    const res = await apiFetch(`/api/media/preferences${status ? `?status=${status}` : ""}`);
    if (!res.ok) return [];
    return (await res.json()) as MediaPreference[];
  } catch {
    return [];
  }
}

export async function saveMediaPreference(
  item: TmdbItem,
  status: MediaPreferenceStatus,
  tvdbId?: number | null,
): Promise<MediaPreference | null> {
  try {
    const res = await apiFetch("/api/media/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: item.kind,
        tmdbId: item.tmdbId,
        tvdbId: tvdbId ?? null,
        status,
        title: item.title,
        poster: item.poster,
        backdrop: item.backdrop,
        year: item.year,
        overview: item.overview,
        rating: item.rating,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as MediaPreference;
  } catch {
    return null;
  }
}

export async function deleteMediaPreference(kind: "movie" | "series", tmdbId: number): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/media/preferences/${kind}/${tmdbId}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

// ── TorrServer (мгновенный стриминг) ───────────────────────────────────
export interface TorrServerFile {
  index: number;
  path: string;
  length: number;
  playable: boolean; // браузер тянет напрямую (mp4/m4v/webm)
}
export interface TorrServerAdd {
  hash: string;
  title: string;
  file: TorrServerFile | null; // лучший видеофайл
  files: TorrServerFile[];
}
export interface TorrServerStream {
  hash: string;
  title: string;
  file: TorrServerFile | null;
}

export async function torrserverAdd(
  link: string,
  title?: string,
): Promise<TorrServerAdd | null> {
  try {
    const res = await apiFetch("/api/media/torrserver/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link, title }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TorrServerAdd;
  } catch {
    return null;
  }
}

export async function torrserverList(): Promise<TorrServerStream[]> {
  try {
    const res = await apiFetch("/api/media/torrserver/list");
    if (!res.ok) return [];
    return (await res.json()) as TorrServerStream[];
  } catch {
    return [];
  }
}

export async function torrserverRemove(hash: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/media/torrserver/${hash}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Прямой URL стрима (вне jwtAuth, LAN-only) — для <video src> и копирования/.m3u.
export function torrserverStreamUrl(hash: string, index: number): string {
  return `/api/media/torrserver/stream?hash=${hash}&index=${index}`;
}

export interface LibraryItem {
  id: string;
  name: string;
  type: "Movie" | "Series";
  year: number | null;
  rating: number | null;
  tmdbId: number | null;
  tvdbId: number | null;
  childCount: number | null;
  played: boolean;
  unplayed: number;
}

export async function getMediaLibrary(): Promise<LibraryItem[]> {
  try {
    const res = await apiFetch("/api/media/library");
    if (!res.ok) return [];
    return (await res.json()) as LibraryItem[];
  } catch {
    return [];
  }
}

export interface SeriesEpisode {
  id: string;
  name: string;
  seasonNumber: number;
  episodeNumber: number | null;
  played: boolean;
}
export interface SeriesSeason {
  seasonNumber: number;
  episodes: SeriesEpisode[];
}
export interface SeriesDetail {
  id: string;
  name: string;
  tvdbId: number | null;
  seasons: SeriesSeason[];
}

export async function getSeriesDetail(
  id: string,
): Promise<SeriesDetail | null> {
  try {
    const res = await apiFetch(`/api/media/series/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as SeriesDetail;
  } catch {
    return null;
  }
}

// ── Детальные страницы (native monitor + Jellyfin) ──────────────────────
export interface DetailEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string | null;
  hasFile: boolean;
  quality: string | null;
  size: number | null;
  jellyfinId: string | null;
  played: boolean;
}
export interface DetailSeason {
  seasonNumber: number;
  episodes: DetailEpisode[];
  fileCount: number;
  totalCount: number;
  monitored: boolean;
}
export interface SeriesPageDetail {
  jellyfinId: string;
  title: string;
  year: number | null;
  overview: string | null;
  genres: string[];
  network: string | null;
  status: string | null;
  runtime: number | null;
  rating: number | null;
  posterRemote: string | null;
  backdropRemote: string | null;
  tvdbId: number | null;
  inMonitor: boolean;
  monitored: boolean;
  seasons: DetailSeason[];
}
export interface MoviePageDetail {
  jellyfinId: string;
  title: string;
  year: number | null;
  overview: string | null;
  genres: string[];
  studio: string | null;
  status: string | null;
  runtime: number | null;
  rating: number | null;
  posterRemote: string | null;
  backdropRemote: string | null;
  tmdbId: number | null;
  inMonitor: boolean;
  monitored: boolean;
  hasFile: boolean;
  quality: string | null;
  size: number | null;
}

export async function getSeriesPageDetail(
  id: string,
): Promise<SeriesPageDetail | null> {
  try {
    const res = await apiFetch(
      `/api/media/detail/series/${encodeURIComponent(id)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as SeriesPageDetail;
  } catch {
    return null;
  }
}

export async function getMoviePageDetail(
  id: string,
): Promise<MoviePageDetail | null> {
  try {
    const res = await apiFetch(
      `/api/media/detail/movie/${encodeURIComponent(id)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as MoviePageDetail;
  } catch {
    return null;
  }
}

// ── Discovery: поиск тайтлов (фильмы + сериалы) + детальные страницы по внешнему id ──
// Карточки работают и для тайтлов, которых ещё нет в библиотеке (id = tvdbId/tmdbId).
export async function discoverSearch(q: string): Promise<MediaLookupItem[]> {
  try {
    const res = await apiFetch(
      `/api/media/discover/search?q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as MediaLookupItem[];
  } catch {
    return [];
  }
}

export async function getSeriesDiscoverDetail(
  tvdbId: number,
): Promise<SeriesPageDetail | null> {
  try {
    const res = await apiFetch(`/api/media/discover/detail/series/${tvdbId}`);
    if (!res.ok) return null;
    return (await res.json()) as SeriesPageDetail;
  } catch {
    return null;
  }
}

export async function getMovieDiscoverDetail(
  tmdbId: number,
): Promise<MoviePageDetail | null> {
  try {
    const res = await apiFetch(`/api/media/discover/detail/movie/${tmdbId}`);
    if (!res.ok) return null;
    return (await res.json()) as MoviePageDetail;
  } catch {
    return null;
  }
}

// ── Расписание / monitor / поиск сезона ────────────────────────────────
export interface CalendarItem {
  kind: "movie" | "series";
  title: string;
  externalId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  airDate: string | null;
  hasFile: boolean;
  monitored: boolean;
}

export async function getCalendar(days = 14): Promise<CalendarItem[]> {
  try {
    const res = await apiFetch(`/api/media/calendar?days=${days}`);
    if (!res.ok) return [];
    return (await res.json()) as CalendarItem[];
  } catch {
    return [];
  }
}

// Запуск поиска: весь сезон (seasonNumber) / недостающие (без него) / фильм. id = tvdbId|tmdbId.
export async function seasonSearch(
  type: "series" | "movie",
  id: number,
  seasonNumber?: number,
): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/season/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, seasonNumber }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function setMonitored(
  type: "series" | "movie",
  id: number,
  monitored: boolean,
  seasonNumber?: number,
): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, monitored, seasonNumber }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Продолжить просмотр + единый поиск ─────────────────────────────────
export interface ResumeItem {
  id: string;
  title: string;
  kind: "movie" | "episode";
  positionPct: number;
  year: number | null;
  seriesId: string | null;
}
export async function getContinueWatching(): Promise<ResumeItem[]> {
  try {
    const res = await apiFetch("/api/media/continue");
    if (!res.ok) return [];
    return (await res.json()) as ResumeItem[];
  } catch {
    return [];
  }
}

export interface UnifiedSearchResult {
  inLibrary: LibraryItem[];
  discover: MediaLookupItem[];
  releases: SearchResult[];
}
export async function unifiedSearch(q: string): Promise<UnifiedSearchResult> {
  try {
    const res = await apiFetch(`/api/media/unified?q=${encodeURIComponent(q)}`);
    if (!res.ok) return { inLibrary: [], discover: [], releases: [] };
    return (await res.json()) as UnifiedSearchResult;
  } catch {
    return { inLibrary: [], discover: [], releases: [] };
  }
}

export interface ReleaseOption {
  guid: string;
  indexerId?: number | string;
  title: string;
  query?: string;
  quality?: string;
  languages?: string[];
  size: number;
  seeders: number | null;
  leechers?: number | null;
  peers?: number | null;
  grabs?: number | null;
  indexer: string;
  trackerName?: string;
  trackerId?: number | string;
  url?: string | null;
  detailUrl?: string | null;
  publishDate?: string | null;
  description?: string | null;
  posterRemote?: string | null;
  imdb?: string | null;
  tmdb?: string | null;
  infoHash?: string | null;
  voice?: "dub" | "mvo" | "dvo" | "avo" | "sub" | "original" | "unknown";
  voiceLabel?: string | null;
  releaseGroup?: string | null;
  studioHint?: string | null;
  details?: {
    provider: string;
    rawUrl: string;
    title?: string | null;
    posterRemote?: string | null;
    summary?: string | null;
    technical?: {
      quality?: string | null;
      video?: string | null;
      audio?: string | null;
      translation?: string | null;
      voiceCodes?: string[];
      voiceLabels?: string[];
      duration?: string | null;
      size?: string | null;
      uploadedAt?: string | null;
      updatedAt?: string | null;
      fileCount?: number | null;
    };
    ratings?: {
      imdb?: string | null;
      kinopoisk?: string | null;
      tracker?: string | null;
    };
    stats?: {
      seeders?: number | null;
      leechers?: number | null;
      completed?: number | null;
      comments?: number | null;
    };
  } | null;
  protocol?: string;
  rejected?: boolean;
  rejections?: string[];
  category?: string | null;
  score?: number;
  scoreReasons?: string[];
  warnings?: string[];
  parsed?: {
    resolution?: number | null;
    codec?: string | null;
    source?: string | null;
    languages?: string[];
    voice?: "dub" | "mvo" | "dvo" | "avo" | "sub" | "original" | "unknown";
    voiceLabel?: string | null;
    releaseGroup?: string | null;
    studioHint?: string | null;
    hdr?: string | null;
  };
}

export interface MediaSearchResponse<T> {
  items: T[];
  error: string | null;
  status: number | null;
}

async function readMediaSearchError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; configured?: boolean };
    if (body.configured === false) return "Jackett не настроен";
    if (body.error) return body.error.replace(/^Error:\s*/, "");
  } catch {
    /* ignore non-json errors */
  }
  return res.status >= 500 ? "Ошибка поиска" : `Ошибка поиска (${res.status})`;
}

export async function searchReleaseOptions(p: {
  type: "movie" | "series";
  id: number;
  seasonNumber?: number;
}): Promise<MediaSearchResponse<ReleaseOption>> {
  try {
    const res = await apiFetch("/api/media/release/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) return { items: [], error: await readMediaSearchError(res), status: res.status };
    return { items: (await res.json()) as ReleaseOption[], error: null, status: res.status };
  } catch {
    return { items: [], error: "Ошибка сети", status: null };
  }
}

export async function grabRelease(p: {
  type: "movie" | "series";
  guid: string;
  indexerId: number | string;
}): Promise<{ ok: boolean; error: string | null; infohash?: string; added?: boolean }> {
  try {
    const res = await apiFetch("/api/media/release/grab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) return { ok: false, error: await readMediaSearchError(res) };
    const body = (await res.json()) as { infohash?: string; added?: boolean };
    return { ok: true, error: null, infohash: body.infohash, added: body.added };
  } catch {
    return { ok: false, error: "Ошибка сети" };
  }
}

export async function getImportCandidates(p: {
  type: "movie" | "series";
  downloadId: string;
}): Promise<ManualImportFile[]> {
  try {
    const res = await apiFetch("/api/media/import/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) return [];
    return (await res.json()) as ManualImportFile[];
  } catch {
    return [];
  }
}

export async function executeImport(p: {
  type: "movie" | "series";
  downloadId: string;
  fileIds: number[];
  importMode?: "copy" | "move";
}): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/import/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Постеры тащим через бэкенд-прокси: у клиентов часто нет IPv6-egress до BunnyCDN
// (TMDB резолвится в AAAA) → прямой <img> виснет по таймауту. Бэкенд ходит по IPv4.
export function posterUrl(
  remote: string | null | undefined,
  w?: "w342" | "w780" | "w1280" | "original",
): string | undefined {
  if (!remote) return undefined;
  return `/api/poster?url=${encodeURIComponent(remote)}${w ? `&w=${w}` : ""}`;
}

// Широкий бэкдроп (для hero-фона). Тащим w1280-кроп через прокси.
export function backdropUrl(
  remote: string | null | undefined,
  w: "w780" | "w1280" | "original" = "w1280",
): string | undefined {
  if (!remote) return undefined;
  return `/api/poster?url=${encodeURIComponent(remote)}&w=${w}`;
}

// Постер из Jellyfin по id элемента (токен инжектит бэкенд, не утекает в браузер).
export function jellyfinPosterUrl(id: string): string {
  return `/api/poster?jf=${encodeURIComponent(id)}`;
}

// Backdrop image from Jellyfin (wide crop for hero backgrounds).
export function jellyfinBackdropUrl(id: string): string {
  return `/api/poster?jf=${encodeURIComponent(id)}&type=Backdrop`;
}

// Получить HLS-путь (под бэкенд-прокси) для воспроизведения элемента.
export async function getMediaPlayUrl(id: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/media/play/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
  } catch {
    return null;
  }
}

export interface SearchResult {
  guid: string;
  title: string;
  size: number;
  seeders: number;
  indexer: string;
  url: string | null;
  query?: string;
}

export async function searchReleases(q: string): Promise<MediaSearchResponse<SearchResult>> {
  try {
    const res = await apiFetch(`/api/media/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return { items: [], error: await readMediaSearchError(res), status: res.status };
    return { items: (await res.json()) as SearchResult[], error: null, status: res.status };
  } catch {
    return { items: [], error: "Ошибка сети", status: null };
  }
}

// ── Media v2: пофайловый выбор серий (preview → grab selected) ──────────
export interface PickFile {
  fileIndex: number;
  path: string;
  length: number;
  isVideo: boolean;
  season: number | null;
  episodes: number[];
}
export interface TorrentPreview {
  infohash: string;
  title: string;
  files: PickFile[];
}

// Предпросмотр файлов торрента (через TorrServer, без скачивания).
export async function previewTorrentFiles(
  source: string,
): Promise<TorrentPreview | null> {
  try {
    const res = await apiFetch("/api/media/pick/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TorrentPreview;
  } catch {
    return null;
  }
}

// Скачать только выбранные файлы + сохранить привязку торрент↔контент.
export async function grabSelectedFiles(input: {
  contentType: "movie" | "series";
  tmdbId?: number | null;
  tvdbId?: number | null;
  title: string;
  source: string;
  infohash: string;
  files: PickFile[];
  wantedIndexes: number[];
}): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/pick/grab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Докачать ещё файлы через тот же торрент.
export async function pickMoreFiles(
  infohash: string,
  addIndexes: number[],
): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/pick/more", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ infohash, addIndexes }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ContentTorrentFile {
  fileIndex: number;
  path: string;
  length: number;
  wanted: boolean;
  seasonNumber: number | null;
  episodeNumber: number | null;
  progress: number; // 0..1
}
export interface ContentTorrent {
  infohash: string;
  title: string;
  magnet: string | null;
  selectedRelease: ReleaseOption | null;
  selectedTitle: string | null;
  selectedIndexer: string | null;
  selectedSeasonNumber: number | null;
  selectedAt: string | null;
  files: ContentTorrentFile[];
}

// Разложить скачанные файлы торрента в библиотеку (свой органайзер).
export async function organizeTorrent(
  infohash: string,
): Promise<{ organized: number; skipped: number } | null> {
  try {
    const res = await apiFetch("/api/media/pick/organize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ infohash }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { organized: number; skipped: number };
  } catch {
    return null;
  }
}

// ── Media v2 (Фаза 3): файловый менеджер медиатеки ──────────────────────
export interface FileEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
  mtime: number;
  ext: string;
}
export interface FileListing {
  path: string;
  entries: FileEntry[];
}

// null → файл-браузер не настроен (нет MEDIA_ROOT) либо ошибка.
export async function listFiles(path = ""): Promise<FileListing | null> {
  try {
    const res = await apiFetch(
      `/api/media/files?path=${encodeURIComponent(path)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as FileListing;
  } catch {
    return null;
  }
}

async function fsAction(
  endpoint: string,
  body: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/media/files/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
export const fsMkdir = (path: string, name: string) =>
  fsAction("mkdir", { path, name });
export const fsRename = (path: string, name: string) =>
  fsAction("rename", { path, name });
export const fsMove = (src: string, dest: string) =>
  fsAction("move", { src, dest });
export const fsDelete = (path: string) => fsAction("delete", { path });

// Торренты, привязанные к тайтлу (секция «Уже качается из этого торрента»).
export async function getContentTorrents(p: {
  type: "movie" | "series";
  tmdbId?: number | null;
  tvdbId?: number | null;
}): Promise<ContentTorrent[]> {
  try {
    const qs = new URLSearchParams({ type: p.type });
    if (p.tmdbId) qs.set("tmdbId", String(p.tmdbId));
    if (p.tvdbId) qs.set("tvdbId", String(p.tvdbId));
    const res = await apiFetch(`/api/media/pick/torrents?${qs.toString()}`);
    if (!res.ok) return [];
    return (await res.json()) as ContentTorrent[];
  } catch {
    return [];
  }
}

// Поиск/добавление через native monitor (TMDB + Jackett + qBittorrent).
export interface MediaLookupItem {
  kind: "movie" | "series";
  id: number;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  added: boolean;
}

export async function lookupTitle(
  type: "movie" | "series",
  q: string,
): Promise<MediaLookupItem[]> {
  try {
    const res = await apiFetch(
      `/api/media/lookup?type=${type}&q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as MediaLookupItem[];
  } catch {
    return [];
  }
}

export async function addTitle(
  type: "movie" | "series",
  id: number,
): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface PlayDevice {
  id: string;
  deviceName: string;
  client: string;
  nowPlaying: string | null;
}

export async function getMediaDevices(): Promise<PlayDevice[]> {
  try {
    const res = await apiFetch("/api/media/devices");
    if (!res.ok) return [];
    return (await res.json()) as PlayDevice[];
  } catch {
    return [];
  }
}

export async function playOnDevice(
  sessionId: string,
  itemId: string,
): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/play-to", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, itemId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function addTorrent(url: string): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/torrent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function torrentAction(
  hash: string,
  action: "pause" | "resume" | "delete",
): Promise<boolean> {
  try {
    const res = await apiFetch(
      `/api/media/torrent/${encodeURIComponent(hash)}/${action}`,
      {
        method: "POST",
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function refreshJellyfin(): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/scan", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}
