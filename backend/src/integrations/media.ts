// Медиа-стек: Jellyfin (что играет + библиотека + плеер) + Sonarr/Radarr/qBittorrent
// (очередь загрузок) + Prowlarr (поиск релизов). Каждый источник опционален и изолирован
// через Promise.allSettled — падение одного не ломает остальные. Не настроено → "Not configured".

import { config } from "../config.js";

export interface NowPlaying {
  title: string;
  user: string;
  client: string;
  type: string; // Movie | Episode | ...
  positionPct: number | null;
}

export interface DownloadItem {
  hash: string;
  title: string;
  source: "sonarr" | "radarr" | "qbittorrent";
  progress: number; // 0..100
  state: string;
  dlspeed?: number; // байт/с (только qBittorrent)
  eta?: number | null; // секунды до завершения, null = неизвестно
  seeds?: number;
  size?: number; // байт
}

export interface MediaData {
  configured: boolean;
  nowPlaying: NowPlaying[];
  downloads: DownloadItem[];
}

export interface LibraryItem {
  id: string;
  name: string;
  type: string; // Movie | Episode | Series
  seriesName: string | null;
  year: number | null;
}

export interface SearchResult {
  guid: string;
  title: string;
  size: number;
  seeders: number;
  indexer: string;
  url: string | null; // magnet или .torrent — то, что отдаём в qBittorrent
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

function jfHeaders(): Record<string, string> {
  return { "X-Emby-Token": config.media.jellyfin.apiKey! };
}

async function jellyfinNowPlaying(): Promise<NowPlaying[]> {
  if (!config.media.jellyfin.configured) return [];
  const res = await fetch(`${config.media.jellyfin.url}/Sessions`, {
    headers: jfHeaders(),
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

interface JfItem {
  Id: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ProductionYear?: number;
}

// Недавно добавленные элементы библиотеки (фильмы + эпизоды).
export async function getLibrary(): Promise<LibraryItem[]> {
  if (!config.media.jellyfin.configured) return [];
  const url = new URL(`${config.media.jellyfin.url}/Items`);
  url.searchParams.set("Recursive", "true");
  url.searchParams.set("IncludeItemTypes", "Movie,Episode");
  url.searchParams.set("SortBy", "DateCreated");
  url.searchParams.set("SortOrder", "Descending");
  url.searchParams.set("Limit", "40");
  url.searchParams.set("Fields", "ProductionYear");
  const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Jellyfin /Items responded ${res.status}`);
  const body = (await res.json()) as { Items?: JfItem[] };
  return (body.Items ?? []).map((it) => ({
    id: it.Id,
    name: it.Name ?? "—",
    type: it.Type ?? "—",
    seriesName: it.SeriesName ?? null,
    year: it.ProductionYear ?? null,
  }));
}

// Первый userId Jellyfin (нужен PlaybackInfo). Кешируем.
let jfUserId: string | null = null;
async function jellyfinUserId(): Promise<string | null> {
  if (jfUserId) return jfUserId;
  const res = await fetch(`${config.media.jellyfin.url}/Users`, {
    headers: jfHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const users = (await res.json()) as { Id: string }[];
  jfUserId = users[0]?.Id ?? null;
  return jfUserId;
}

// DeviceProfile с пустыми DirectPlayProfiles заставляет Jellyfin отдать HLS-транскод,
// который играется в любом браузере. Возвращаем путь под наш прокси (api_key вырезан —
// его подставит прокси заголовком).
export async function getPlaybackPath(itemId: string): Promise<string> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const userId = await jellyfinUserId();
  const url = new URL(`${config.media.jellyfin.url}/Items/${itemId}/PlaybackInfo`);
  if (userId) url.searchParams.set("UserId", userId);

  const deviceProfile = {
    DeviceProfile: {
      MaxStreamingBitrate: 120_000_000,
      DirectPlayProfiles: [],
      TranscodingProfiles: [
        {
          Container: "ts",
          Type: "Video",
          Protocol: "hls",
          VideoCodec: "h264",
          AudioCodec: "aac,mp3",
          Context: "Streaming",
        },
      ],
      ContainerProfiles: [],
      CodecProfiles: [],
      SubtitleProfiles: [{ Format: "vtt", Method: "Hls" }],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { ...jfHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(deviceProfile),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Jellyfin PlaybackInfo responded ${res.status}`);
  const info = (await res.json()) as {
    MediaSources?: { TranscodingUrl?: string; Id?: string }[];
  };
  const src = info.MediaSources?.[0];
  let transcodingUrl = src?.TranscodingUrl;
  if (!transcodingUrl) {
    // Прямой HLS как запасной путь.
    transcodingUrl = `/videos/${itemId}/master.m3u8?MediaSourceId=${src?.Id ?? itemId}&VideoCodec=h264&AudioCodec=aac&SegmentContainer=ts`;
  }
  // Вырезаем api_key — прокси подставит токен заголовком.
  const cleaned = transcodingUrl.replace(/([?&])api_key=[^&]*/gi, "$1").replace(/[?&]$/, "");
  return `/api/media/jellyfin${cleaned.startsWith("/") ? "" : "/"}${cleaned}`;
}

// Триггер скана библиотеки (после докачки торрента).
export async function jellyfinRefresh(): Promise<void> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const res = await fetch(`${config.media.jellyfin.url}/Library/Refresh`, {
    method: "POST",
    headers: jfHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok && res.status !== 204) throw new Error(`Jellyfin Refresh responded ${res.status}`);
}

// Прозрачный реверс-прокси к Jellyfin: инжектит токен заголовком, api_key из запроса
// игнорируется. Возвращает upstream Response для стриминга (плеер/изображения).
export async function jellyfinProxy(subpath: string, query: URLSearchParams): Promise<Response> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const url = new URL(`${config.media.jellyfin.url}/${subpath}`);
  for (const [k, v] of query.entries()) {
    if (k.toLowerCase() !== "api_key") url.searchParams.append(k, v);
  }
  return fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(30_000) });
}

// ── Sonarr / Radarr (одинаковый /api/v3/queue) ─────────────────────────
interface ArrQueueRecord {
  title?: string;
  size?: number;
  sizeleft?: number;
  status?: string;
  downloadId?: string;
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
    return {
      hash: r.downloadId ?? r.title ?? Math.random().toString(36),
      title: r.title ?? "—",
      source,
      progress,
      state: r.status ?? "—",
      size,
    };
  });
}

// ── qBittorrent ─────────────────────────────────────────────────────────
let qbSid: { value: string; at: number } | null = null;

async function qbLogin(): Promise<string> {
  const cfg = config.media.qbittorrent;
  if (qbSid && Date.now() - qbSid.at < 30 * 60_000) return qbSid.value;
  const res = await fetch(`${cfg.url}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: cfg.username!, password: cfg.password! }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`qBittorrent login ${res.status}`);
  const sid = (res.headers.get("set-cookie") ?? "").split(";")[0];
  qbSid = { value: sid, at: Date.now() };
  return sid;
}

interface QbTorrent {
  hash?: string;
  name?: string;
  progress?: number; // 0..1
  state?: string;
  dlspeed?: number;
  eta?: number;
  num_seeds?: number;
  size?: number;
}

async function qbittorrentDownloads(): Promise<DownloadItem[]> {
  if (!config.media.qbittorrent.configured) return [];
  const sid = await qbLogin();
  const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/info`, {
    headers: sid ? { Cookie: sid } : {},
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`qBittorrent info ${res.status}`);
  const torrents = (await res.json()) as QbTorrent[];
  return torrents.map((t) => ({
    hash: t.hash ?? "—",
    title: t.name ?? "—",
    source: "qbittorrent" as const,
    progress: Math.round((t.progress ?? 0) * 100),
    state: t.state ?? "—",
    dlspeed: t.dlspeed ?? 0,
    eta: t.eta != null && t.eta < 8_640_000 ? t.eta : null,
    seeds: t.num_seeds ?? 0,
    size: t.size ?? 0,
  }));
}

// Добавить торрент в qBittorrent (magnet или http(s) .torrent URL).
export async function qbAdd(urlOrMagnet: string): Promise<void> {
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  const sid = await qbLogin();
  const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/add`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sid ? { Cookie: sid } : {}) },
    body: new URLSearchParams({ urls: urlOrMagnet }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`qBittorrent add ${res.status}`);
  cache = null;
}

const QB_ACTIONS = new Set(["pause", "resume", "delete"]);

// Управление торрентом по хешу.
export async function qbAction(hash: string, action: string): Promise<void> {
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  if (!QB_ACTIONS.has(action)) throw new Error(`Недопустимое действие: ${action}`);
  const sid = await qbLogin();
  const endpoint =
    action === "delete" ? "delete" : action === "pause" ? "pause" : "resume";
  const body =
    action === "delete"
      ? new URLSearchParams({ hashes: hash, deleteFiles: "false" })
      : new URLSearchParams({ hashes: hash });
  const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sid ? { Cookie: sid } : {}) },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`qBittorrent ${action} ${res.status}`);
  cache = null;
}

// ── Prowlarr — поиск релизов ─────────────────────────────────────────────
interface ProwlarrRelease {
  guid?: string;
  title?: string;
  size?: number;
  seeders?: number;
  indexer?: string;
  protocol?: string;
  magnetUrl?: string;
  downloadUrl?: string;
}

export async function prowlarrSearch(query: string): Promise<SearchResult[]> {
  const cfg = config.media.prowlarr;
  if (!cfg.configured) return [];
  const url = new URL(`${cfg.url}/api/v1/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "30");
  const res = await fetch(url, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Prowlarr search ${res.status}`);
  const releases = (await res.json()) as ProwlarrRelease[];
  return releases
    .filter((r) => r.protocol === "torrent")
    .sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0))
    .slice(0, 25)
    .map((r) => ({
      guid: r.guid ?? Math.random().toString(36),
      title: r.title ?? "—",
      size: r.size ?? 0,
      seeders: r.seeders ?? 0,
      indexer: r.indexer ?? "—",
      url: r.magnetUrl ?? r.downloadUrl ?? null,
    }));
}

// ── Сводка ────────────────────────────────────────────────────────────────
export async function getMedia(): Promise<MediaData> {
  if (!config.media.configured) {
    return { configured: false, nowPlaying: [], downloads: [] };
  }
  if (cache && Date.now() - cache.at < 8_000) return cache.data;

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
