// Медиа-стек: Jellyfin (что играет + библиотека + плеер) + Sonarr/Radarr/qBittorrent
// (очередь загрузок) + Prowlarr (поиск релизов). Каждый источник опционален и изолирован
// через Promise.allSettled — падение одного не ломает остальные. Не настроено → "Not configured".

import { config } from "../config.js";
import { request } from "undici";

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

export interface PlayDevice {
  id: string;
  deviceName: string;
  client: string;
  nowPlaying: string | null;
}

let cache: { data: MediaData; at: number } | null = null;

// ── Jellyfin ───────────────────────────────────────────────────────────
interface JfSession {
  Id?: string;
  DeviceName?: string;
  SupportsRemoteControl?: boolean;
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

// Сессии Jellyfin, которыми можно дистанционно управлять (приложение Jellyfin
// открыто на устройстве и поддерживает remote-control). Цели для «играть на ТВ».
export async function jellyfinSessions(): Promise<PlayDevice[]> {
  if (!config.media.jellyfin.configured) return [];
  const res = await fetch(`${config.media.jellyfin.url}/Sessions`, {
    headers: jfHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Jellyfin /Sessions responded ${res.status}`);
  const sessions = (await res.json()) as JfSession[];
  return sessions
    .filter((s) => s.SupportsRemoteControl && s.Id && s.DeviceName)
    .map((s) => ({
      id: s.Id!,
      deviceName: s.DeviceName!,
      client: s.Client ?? "—",
      nowPlaying: s.NowPlayingItem?.Name ?? null,
    }));
}

// Отправить элемент на устройство: PlayNow в указанную сессию.
export async function jellyfinPlayTo(sessionId: string, itemId: string): Promise<void> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const url = new URL(`${config.media.jellyfin.url}/Sessions/${sessionId}/Playing`);
  url.searchParams.set("playCommand", "PlayNow");
  url.searchParams.set("itemIds", itemId);
  const res = await fetch(url, {
    method: "POST",
    headers: jfHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok && res.status !== 204) throw new Error(`Jellyfin Playing responded ${res.status}`);
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

// Резолв http(s)-источника: Prowlarr раздаёт downloadUrl на host.docker.internal,
// который qBittorrent (в изолированной docker-сети) не видит. Поэтому .torrent тащит
// бэкенд (он до Prowlarr достаёт), а в qBittorrent уже грузим байты файлом. Часть
// индексеров редиректит на magnet — ловим это вручную (maxRedirections:0).
async function resolveTorrent(
  src: string,
  depth = 0,
): Promise<{ magnet?: string; bytes?: Buffer }> {
  if (src.startsWith("magnet:")) return { magnet: src };
  if (depth > 5) throw new Error("Слишком много редиректов при резолве торрента");
  const res = await request(src, {
    method: "GET",
    maxRedirections: 0,
    headers: { "User-Agent": "MissionControl/1.0" },
    headersTimeout: 15_000,
    bodyTimeout: 15_000,
  });
  // Редирект — может вести на magnet: или на другой http(s).
  if (res.statusCode >= 300 && res.statusCode < 400) {
    const loc = res.headers.location;
    const target = Array.isArray(loc) ? loc[0] : loc;
    if (!target) throw new Error(`Редирект без Location (${res.statusCode})`);
    res.body.destroy();
    return resolveTorrent(target, depth + 1);
  }
  if (res.statusCode >= 400) {
    res.body.destroy();
    throw new Error(`Источник торрента ответил ${res.statusCode}`);
  }
  const buf = Buffer.from(await res.body.arrayBuffer());
  // Иногда отдают текст с magnet-ссылкой вместо .torrent.
  const head = buf.subarray(0, 64).toString("utf8").trim();
  if (head.startsWith("magnet:")) {
    return { magnet: buf.toString("utf8").trim().split(/\s/)[0] };
  }
  return { bytes: buf };
}

// Разбираем ответ qBittorrent /torrents/add: новые версии (5.x) отдают JSON
// {added_torrent_ids, failure_count}, старые — текст "Ok."/"Fails.".
async function assertQbAdded(res: Response): Promise<void> {
  if (!res.ok) throw new Error(`qBittorrent add ${res.status}`);
  const text = (await res.text()).trim();
  if (text.startsWith("{")) {
    let json: { added_torrent_ids?: unknown[]; failure_count?: number } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (
      json &&
      (json.failure_count ?? 0) > 0 &&
      (json.added_torrent_ids?.length ?? 0) === 0
    ) {
      throw new Error("qBittorrent не смог добавить торрент (источник недоступен)");
    }
  } else if (/^fails/i.test(text)) {
    throw new Error("qBittorrent отклонил торрент");
  }
}

// Добавить торрент в qBittorrent (magnet или http(s) .torrent URL).
export async function qbAdd(urlOrMagnet: string): Promise<void> {
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  const sid = await qbLogin();
  const addUrl = `${config.media.qbittorrent.url}/api/v2/torrents/add`;

  const resolved = await resolveTorrent(urlOrMagnet);

  let res: Response;
  if (resolved.magnet) {
    res = await fetch(addUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sid ? { Cookie: sid } : {}) },
      body: new URLSearchParams({ urls: resolved.magnet }),
      signal: AbortSignal.timeout(15_000),
    });
  } else {
    // Загружаем .torrent файлом — qBittorrent сам достучится до пиров.
    // Content-Type не задаём вручную: fetch выставит multipart boundary.
    const fd = new FormData();
    fd.append(
      "torrents",
      new Blob([resolved.bytes!], { type: "application/x-bittorrent" }),
      "file.torrent",
    );
    res = await fetch(addUrl, {
      method: "POST",
      headers: { ...(sid ? { Cookie: sid } : {}) },
      body: fd,
      signal: AbortSignal.timeout(15_000),
    });
  }
  await assertQbAdded(res);
  cache = null;
}

// qBittorrent 5.x (WebAPI ≥2.11) переименовал pause/resume → stop/start, старые ручки
// удалены (404). Держим список кандидатов: новая ручка первой, старая как fallback —
// одинаково работает и на 4.x, и на 5.x.
const QB_ENDPOINTS: Record<string, string[]> = {
  pause: ["stop", "pause"],
  resume: ["start", "resume"],
  delete: ["delete"],
};

// Управление торрентом по хешу.
export async function qbAction(hash: string, action: string): Promise<void> {
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  const candidates = QB_ENDPOINTS[action];
  if (!candidates) throw new Error(`Недопустимое действие: ${action}`);
  const sid = await qbLogin();
  const body =
    action === "delete"
      ? new URLSearchParams({ hashes: hash, deleteFiles: "false" })
      : new URLSearchParams({ hashes: hash });

  let lastStatus = 0;
  for (const endpoint of candidates) {
    const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sid ? { Cookie: sid } : {}) },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      cache = null;
      return;
    }
    lastStatus = res.status;
    if (res.status !== 404) break; // 404 → ручка отсутствует, пробуем следующую
  }
  throw new Error(`qBittorrent ${action} ${lastStatus}`);
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
  url.searchParams.set("limit", "100");
  const res = await fetch(url, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Prowlarr search ${res.status}`);
  const releases = (await res.json()) as ProwlarrRelease[];
  // Часть индексеров (напр. torrent-pirat) игнорирует запрос и заваливает выдачу
  // нерелевантным шумом с высокими сидами. Фильтруем по токенам запроса: каждое
  // значимое слово (≥4 символа, не число) должно встречаться в названии релиза.
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t));
  return releases
    .filter((r) => r.protocol === "torrent")
    .filter(
      (r) =>
        tokens.length === 0 ||
        tokens.every((t) => (r.title ?? "").toLowerCase().includes(t)),
    )
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

// ── Sonarr / Radarr — поиск и добавление в библиотеку ──────────────────────
// «Правильный» путь в медиатеку: добавляем тайтл в Radarr/Sonarr, они грабят
// релиз через qBittorrent (своя категория), импортируют (hardlink+rename) в
// /data/movies|/data/tv и триггерят скан Jellyfin. UI только выбирает тайтл.
export interface ArrLookupItem {
  kind: "movie" | "series";
  id: number; // tmdbId (movie) | tvdbId (series) — то, что шлём в arrAdd
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  added: boolean; // уже в библиотеке *arr
}

interface ArrImage {
  coverType?: string;
  remoteUrl?: string;
  url?: string;
}

interface ArrLookupRecord {
  id?: number;
  tmdbId?: number;
  tvdbId?: number;
  title?: string;
  year?: number;
  overview?: string;
  images?: ArrImage[];
}

function arrCfg(kind: "movie" | "series") {
  return kind === "movie" ? config.media.radarr : config.media.sonarr;
}

function arrPoster(images?: ArrImage[]): string | null {
  const p = (images ?? []).find((i) => i.coverType === "poster");
  return p?.remoteUrl ?? p?.url ?? null;
}

// Поиск тайтла. Radarr → /movie/lookup (tmdbId), Sonarr → /series/lookup (tvdbId).
export async function arrLookup(kind: "movie" | "series", term: string): Promise<ArrLookupItem[]> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) return [];
  const path = kind === "movie" ? "movie" : "series";
  const url = new URL(`${cfg.url}/api/v3/${path}/lookup`);
  url.searchParams.set("term", term);
  const res = await fetch(url, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${kind} lookup ${res.status}`);
  const items = (await res.json()) as ArrLookupRecord[];
  return items.slice(0, 20).map((it) => ({
    kind,
    id: (kind === "movie" ? it.tmdbId : it.tvdbId) ?? 0,
    title: it.title ?? "—",
    year: it.year ?? null,
    overview: it.overview ?? "",
    poster: arrPoster(it.images),
    added: Boolean(it.id && it.id > 0),
  }));
}

// Добавить тайтл в библиотеку *arr и запустить поиск релиза.
export async function arrAdd(kind: "movie" | "series", id: number): Promise<{ title: string }> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) throw new Error(`${kind === "movie" ? "Radarr" : "Sonarr"} не настроен`);
  const headers = { "X-Api-Key": cfg.apiKey!, "Content-Type": "application/json" };

  // root folder + quality profile — берём первые доступные (хардкодить путь не нужно).
  const [rootRes, qpRes] = await Promise.all([
    fetch(`${cfg.url}/api/v3/rootfolder`, { headers, signal: AbortSignal.timeout(8_000) }),
    fetch(`${cfg.url}/api/v3/qualityprofile`, { headers, signal: AbortSignal.timeout(8_000) }),
  ]);
  if (!rootRes.ok) throw new Error(`${kind} rootfolder ${rootRes.status}`);
  if (!qpRes.ok) throw new Error(`${kind} qualityprofile ${qpRes.status}`);
  const root = ((await rootRes.json()) as { path: string }[])[0];
  const qp = ((await qpRes.json()) as { id: number }[])[0];
  if (!root || !qp) throw new Error(`${kind}: нет root folder или quality profile`);

  // Полный объект тайтла для POST берём из lookup по идентификатору.
  const path = kind === "movie" ? "movie" : "series";
  const idScheme = kind === "movie" ? "tmdb" : "tvdb";
  const lkRes = await fetch(`${cfg.url}/api/v3/${path}/lookup?term=${idScheme}:${id}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!lkRes.ok) throw new Error(`${kind} lookup ${lkRes.status}`);
  const found = ((await lkRes.json()) as (ArrLookupRecord & Record<string, unknown>)[])[0];
  if (!found) throw new Error(`${kind}: не найдено (id ${id})`);
  if (found.id && found.id > 0) return { title: found.title ?? "—" }; // уже в библиотеке

  const body: Record<string, unknown> = {
    ...found,
    qualityProfileId: qp.id,
    rootFolderPath: root.path,
    monitored: true,
  };
  if (kind === "movie") {
    body.minimumAvailability = "released";
    body.addOptions = { searchForMovie: true };
  } else {
    body.addOptions = { searchForMissingEpisodes: true, monitor: "all" };
  }

  const res = await fetch(`${cfg.url}/api/v3/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok && res.status !== 201) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${kind} add ${res.status}: ${txt.slice(0, 200)}`);
  }
  const created = (await res.json()) as { title?: string };
  cache = null;
  return { title: created.title ?? found.title ?? "—" };
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
