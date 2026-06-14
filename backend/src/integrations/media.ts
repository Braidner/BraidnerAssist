// Медиа-стек: Jellyfin (что играет сейчас) + Sonarr/Radarr/qBittorrent (очередь загрузок).
// Каждый источник опционален и изолирован через Promise.allSettled — падение одного не
// ломает остальные. Не настроено → "Not configured".

import { config } from "../config.js";

export interface NowPlaying {
  title: string;
  user: string;
  client: string;
  type: string; // Movie | Episode | ...
  positionPct: number | null;
}

export interface DownloadItem {
  title: string;
  source: "sonarr" | "radarr" | "qbittorrent";
  progress: number; // 0..100
  state: string;
}

export interface MediaData {
  configured: boolean;
  nowPlaying: NowPlaying[];
  downloads: DownloadItem[];
}

let cache: { data: MediaData; at: number } | null = null;

// ── Jellyfin ───────────────────────────────────────────────────────────
interface JfSession {
  UserName?: string;
  Client?: string;
  NowPlayingItem?: {
    Name?: string;
    SeriesName?: string;
    Type?: string;
    RunTimeTicks?: number;
  };
  PlayState?: { PositionTicks?: number };
}

async function jellyfinNowPlaying(): Promise<NowPlaying[]> {
  if (!config.media.jellyfin.configured) return [];
  const res = await fetch(`${config.media.jellyfin.url}/Sessions`, {
    headers: { "X-Emby-Token": config.media.jellyfin.apiKey! },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Jellyfin responded ${res.status}`);
  const sessions = (await res.json()) as JfSession[];
  return sessions
    .filter((s) => s.NowPlayingItem)
    .map((s) => {
      const item = s.NowPlayingItem!;
      const runtime = item.RunTimeTicks ?? 0;
      const pos = s.PlayState?.PositionTicks ?? 0;
      const positionPct = runtime > 0 ? Math.round((pos / runtime) * 100) : null;
      const title = item.SeriesName ? `${item.SeriesName} — ${item.Name ?? ""}` : item.Name ?? "—";
      return {
        title,
        user: s.UserName ?? "—",
        client: s.Client ?? "—",
        type: item.Type ?? "—",
        positionPct,
      };
    });
}

// ── Sonarr / Radarr (одинаковый /api/v3/queue) ─────────────────────────
interface ArrQueueRecord {
  title?: string;
  size?: number;
  sizeleft?: number;
  status?: string;
}

async function arrQueue(
  cfg: { url?: string; apiKey?: string },
  source: "sonarr" | "radarr",
): Promise<DownloadItem[]> {
  if (!cfg.url || !cfg.apiKey) return [];
  const res = await fetch(`${cfg.url}/api/v3/queue?pageSize=50`, {
    headers: { "X-Api-Key": cfg.apiKey },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`${source} responded ${res.status}`);
  const body = (await res.json()) as { records?: ArrQueueRecord[] };
  return (body.records ?? []).map((r) => {
    const size = r.size ?? 0;
    const left = r.sizeleft ?? 0;
    const progress = size > 0 ? Math.round(((size - left) / size) * 100) : 0;
    return { title: r.title ?? "—", source, progress, state: r.status ?? "—" };
  });
}

// ── qBittorrent (cookie-логин → torrents/info) ─────────────────────────
interface QbTorrent {
  name?: string;
  progress?: number; // 0..1
  state?: string;
}

async function qbittorrentDownloads(): Promise<DownloadItem[]> {
  const cfg = config.media.qbittorrent;
  if (!cfg.configured) return [];
  // Логинимся, получаем cookie SID.
  const loginRes = await fetch(`${cfg.url}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: cfg.username!, password: cfg.password! }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!loginRes.ok) throw new Error(`qBittorrent login ${loginRes.status}`);
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const sid = setCookie.split(";")[0];

  const res = await fetch(`${cfg.url}/api/v2/torrents/info`, {
    headers: sid ? { Cookie: sid } : {},
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`qBittorrent info ${res.status}`);
  const torrents = (await res.json()) as QbTorrent[];
  return torrents.map((t) => ({
    title: t.name ?? "—",
    source: "qbittorrent" as const,
    progress: Math.round((t.progress ?? 0) * 100),
    state: t.state ?? "—",
  }));
}

export async function getMedia(): Promise<MediaData> {
  if (!config.media.configured) {
    return { configured: false, nowPlaying: [], downloads: [] };
  }
  if (cache && Date.now() - cache.at < 15_000) return cache.data;

  const [jf, sonarr, radarr, qb] = await Promise.allSettled([
    jellyfinNowPlaying(),
    arrQueue(config.media.sonarr, "sonarr"),
    arrQueue(config.media.radarr, "radarr"),
    qbittorrentDownloads(),
  ]);

  const nowPlaying = jf.status === "fulfilled" ? jf.value : [];
  const downloads = [
    ...(sonarr.status === "fulfilled" ? sonarr.value : []),
    ...(radarr.status === "fulfilled" ? radarr.value : []),
    ...(qb.status === "fulfilled" ? qb.value : []),
  ];

  const data: MediaData = { configured: true, nowPlaying, downloads };
  cache = { data, at: Date.now() };
  return data;
}
