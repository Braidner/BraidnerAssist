// Медиа-стек: Jellyfin (что играет + библиотека + плеер) + qBittorrent.
// Нативный pipeline (TMDB + Jackett + SQLite monitor/import) живёт в nativeMedia.ts.
// Каждый источник опционален и изолирован
// через Promise.allSettled — падение одного не ломает остальные. Не настроено → "Not configured".

import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { tmdbDetails, tmdbFindByTvdb, tmdbSeason, tmdbTvSeasons } from "./tmdb.js";
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
  source: "qbittorrent";
  progress: number; // 0..100
  state: string;
  dlspeed?: number; // байт/с (только qBittorrent)
  eta?: number | null; // секунды до завершения, null = неизвестно
  seeds?: number;
  size?: number; // байт
  category?: string;
  savePath?: string;
  contentType?: "movie" | "series";
  downloadId?: string; // qB-хеш — ключ для ручного импорта
  importPending?: boolean; // скачано, но native importer ещё не разложил файлы
  importMessage?: string; // краткая причина из statusMessages
}

export interface MediaData {
  configured: boolean;
  torrserver: boolean; // TorrServer настроен → фронт показывает блок «Смотреть онлайн»
  tmdb: boolean; // TMDB настроен → дискавери через TMDB
  nowPlaying: NowPlaying[];
  downloads: DownloadItem[];
}

export interface LibraryItem {
  id: string;
  name: string;
  type: "Movie" | "Series";
  year: number | null;
  rating: number | null;
  tmdbId: number | null; // внешний id для сверки discovery с библиотекой
  tvdbId: number | null; // series only — внешний id для поиска релизов
  childCount: number | null; // series only — число сезонов
  played: boolean; // фильм просмотрен / сериал досмотрен полностью
  unplayed: number; // series only — число непросмотренных эпизодов (0 для фильмов)
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

// ── Детальные страницы (Native monitor + Jellyfin playback state) ──────
export interface DetailEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string | null;
  hasFile: boolean;
  quality: string | null;
  size: number | null;
  jellyfinId: string | null; // для плеера, если эпизод есть в Jellyfin
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
  runtime: number | null; // минуты
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

export interface SearchResult {
  guid: string;
  indexerId?: number | string;
  title: string;
  size: number;
  seeders: number;
  leechers?: number | null;
  peers?: number | null;
  grabs?: number | null;
  indexer: string;
  trackerName?: string;
  trackerId?: number | string;
  url: string | null; // magnet или .torrent — то, что отдаём в qBittorrent
  detailUrl?: string | null;
  publishDate?: string | null;
  description?: string | null;
  posterRemote?: string | null;
  imdb?: string | null;
  tmdb?: string | null;
  infoHash?: string | null;
  category?: string | null;
  query?: string;
  score?: number;
  scoreReasons?: string[];
  warnings?: string[];
  voice?: "dub" | "mvo" | "dvo" | "avo" | "sub" | "original" | "unknown";
  voiceLabel?: string | null;
  releaseGroup?: string | null;
  studioHint?: string | null;
  details?: import("./releaseDetails.js").ReleaseDetails | null;
  parsed?: unknown;
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
  CommunityRating?: number;
  ProviderIds?: Record<string, string>;
  ChildCount?: number;
  UserData?: { Played?: boolean; UnplayedItemCount?: number };
}

const tmdbDetailCache = new Map<string, { at: number; title: string | null; overview: string | null }>();
const TMDB_DETAIL_TTL = 24 * 60 * 60_000;

async function tmdbLibraryDetail(type: "Movie" | "Series", tmdbId: number | null): Promise<{ title: string | null; overview: string | null } | null> {
  if (!tmdbId || !config.media.tmdb.configured) return null;
  const kind = type === "Movie" ? "movie" : "series";
  const key = `${kind}:${tmdbId}`;
  const cached = tmdbDetailCache.get(key);
  if (cached && Date.now() - cached.at < TMDB_DETAIL_TTL) return { title: cached.title, overview: cached.overview };
  const detail = await tmdbDetails(kind, tmdbId).catch(() => null);
  const title = detail?.title?.trim() || null;
  const overview = detail?.overview?.trim() || null;
  if (title || overview) tmdbDetailCache.set(key, { at: Date.now(), title, overview });
  return { title, overview };
}

async function tmdbLibraryTitle(type: "Movie" | "Series", tmdbId: number | null): Promise<string | null> {
  return (await tmdbLibraryDetail(type, tmdbId))?.title ?? null;
}

async function localizedMediaText(
  kind: "movie" | "series",
  ids: { tmdbId?: number | null; tvdbId?: number | null },
): Promise<{ title: string | null; overview: string | null }> {
  const monitor = ids.tmdbId
    ? await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind, tmdbId: ids.tmdbId } } }).catch(() => null)
    : ids.tvdbId
      ? await prisma.mediaMonitor.findFirst({ where: { kind, tvdbId: ids.tvdbId } }).catch(() => null)
      : null;
  const tmdb = await tmdbLibraryDetail(kind === "movie" ? "Movie" : "Series", ids.tmdbId ?? null);
  return {
    title: monitor?.title ?? tmdb?.title ?? null,
    overview: monitor?.overview ?? tmdb?.overview ?? null,
  };
}

// Каталог библиотеки: все фильмы + все сериалы (сериал — одна плитка, эпизоды
// видны в drill-down). Movies и Series тащим отдельными запросами через allSettled.
export async function getLibrary(): Promise<LibraryItem[]> {
  if (!config.media.jellyfin.configured) return [];
  const userId = await jellyfinUserId();
  const monitors = await prisma.mediaMonitor.findMany().catch(() => []);
  const monitorByTmdb = new Map(monitors.map((m) => [`${m.kind}:${m.tmdbId}`, m.title]));
  const monitorByTvdb = new Map(monitors.filter((m) => m.tvdbId).map((m) => [`series:${m.tvdbId}`, m.title]));
  const fetchItems = async (type: "Movie" | "Series"): Promise<LibraryItem[]> => {
    const url = new URL(`${config.media.jellyfin.url}/Items`);
    url.searchParams.set("Recursive", "true");
    url.searchParams.set("IncludeItemTypes", type);
    url.searchParams.set("SortBy", "SortName");
    url.searchParams.set("SortOrder", "Ascending");
    url.searchParams.set("Fields", "ProductionYear,ProviderIds,ChildCount,CommunityRating");
    if (userId) url.searchParams.set("userId", userId);
    const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Jellyfin /Items(${type}) responded ${res.status}`);
    const body = (await res.json()) as { Items?: JfItem[] };
    return Promise.all((body.Items ?? []).map(async (it) => {
      const tmdbId = Number(it.ProviderIds?.Tmdb) || null;
      const tvdbId = type === "Series" ? Number(it.ProviderIds?.Tvdb) || null : null;
      const kind = type === "Movie" ? "movie" : "series";
      const localizedName =
        (tmdbId ? monitorByTmdb.get(`${kind}:${tmdbId}`) : null) ??
        (tvdbId ? monitorByTvdb.get(`series:${tvdbId}`) : null) ??
        await tmdbLibraryTitle(type, tmdbId) ??
        it.Name ??
        "—";
      return {
        id: it.Id,
        name: localizedName,
        type,
        year: it.ProductionYear ?? null,
        rating: it.CommunityRating ?? null,
        tmdbId,
        tvdbId,
        childCount: type === "Series" ? it.ChildCount ?? null : null,
        played: Boolean(it.UserData?.Played),
        unplayed: type === "Series" ? Number(it.UserData?.UnplayedItemCount ?? 0) : 0,
      };
    }));
  };
  const [movies, series] = await Promise.allSettled([fetchItems("Movie"), fetchItems("Series")]);
  return [
    ...(series.status === "fulfilled" ? series.value : []),
    ...(movies.status === "fulfilled" ? movies.value : []),
  ];
}

// Сезоны + эпизоды сериала (drill-down). /Shows/{id}/Episodes отдаёт все эпизоды
// с ParentIndexNumber=сезон, IndexNumber=эпизод. Группируем по сезонам.
export async function getSeriesDetail(seriesId: string): Promise<SeriesDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const userId = await jellyfinUserId();
  const url = new URL(`${config.media.jellyfin.url}/Shows/${seriesId}/Episodes`);
  if (userId) url.searchParams.set("UserId", userId);
  url.searchParams.set("Fields", "ProviderIds");
  const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Jellyfin /Episodes responded ${res.status}`);
  const body = (await res.json()) as {
    Items?: {
      Id: string;
      Name?: string;
      ParentIndexNumber?: number;
      IndexNumber?: number;
      SeriesName?: string;
      UserData?: { Played?: boolean };
      SeriesProviderIds?: Record<string, string>;
    }[];
  };
  const items = body.Items ?? [];
  const seasonsMap = new Map<number, SeriesEpisode[]>();
  for (const e of items) {
    const sn = e.ParentIndexNumber ?? 0;
    if (!seasonsMap.has(sn)) seasonsMap.set(sn, []);
    seasonsMap.get(sn)!.push({
      id: e.Id,
      name: e.Name ?? "—",
      seasonNumber: sn,
      episodeNumber: e.IndexNumber ?? null,
      played: Boolean(e.UserData?.Played),
    });
  }
  const seasons: SeriesSeason[] = [...seasonsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seasonNumber, eps]) => ({
      seasonNumber,
      episodes: eps.sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)),
    }));
  const tvdbId = Number(items[0]?.SeriesProviderIds?.Tvdb) || null;
  return { id: seriesId, name: items[0]?.SeriesName ?? "—", tvdbId, seasons };
}

// Полная карточка Jellyfin-элемента (для шапки детальной страницы + played).
interface JfFullItem {
  Name?: string;
  Type?: string;
  Overview?: string;
  Genres?: string[];
  SeriesId?: string;
  ParentId?: string;
  ProviderIds?: Record<string, string>;
  Studios?: { Name?: string }[];
  CommunityRating?: number;
  ProductionYear?: number;
  RunTimeTicks?: number;
  Status?: string;
  UserData?: { Played?: boolean };
}
async function jellyfinItem(id: string): Promise<JfFullItem | null> {
  if (!config.media.jellyfin.configured) return null;
  const userId = await jellyfinUserId();
  const base = userId
    ? `${config.media.jellyfin.url}/Users/${userId}/Items/${id}`
    : `${config.media.jellyfin.url}/Items/${id}`;
  const url = new URL(base);
  url.searchParams.set("Fields", "Overview,Genres,SeriesId,ParentId,ProviderIds,Studios,CommunityRating,ProductionYear,RunTimeTicks,Status");
  const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  return (await res.json()) as JfFullItem;
}

const ticksToMin = (t?: number): number | null => (t && t > 0 ? Math.round(t / 600_000_000) : null);
const episodeKey = (seasonNumber: number | null | undefined, episodeNumber: number | null | undefined): string | null =>
  Number.isFinite(seasonNumber) && Number.isFinite(episodeNumber)
    ? `S${seasonNumber}E${episodeNumber}`
    : null;

async function importedEpisodeKeys(tmdbId: number | null, tvdbId: number | null): Promise<Set<string>> {
  if (!tmdbId && !tvdbId) return new Set();
  const files = await prisma.mediaTorrentFile.findMany({
    where: {
      importedPath: { not: null },
      torrent: {
        contentType: "series",
        OR: [
          ...(tmdbId ? [{ tmdbId }] : []),
          ...(tvdbId ? [{ tvdbId }] : []),
        ],
      },
    },
    select: { seasonNumber: true, episodeNumber: true },
  }).catch(() => []);
  return new Set(files.map((f) => episodeKey(f.seasonNumber, f.episodeNumber)).filter((k): k is string => Boolean(k)));
}

// Детальная страница сериала: Native monitor metadata + Jellyfin episodes/play state.
export async function getSeriesPageDetail(jellyfinId: string): Promise<SeriesPageDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const [jfItemR, jfEpisodesR] = await Promise.allSettled([
    jellyfinItem(jellyfinId),
    getSeriesDetail(jellyfinId),
  ]);
  const jf = jfItemR.status === "fulfilled" ? jfItemR.value : null;
  const jfDetail = jfEpisodesR.status === "fulfilled" ? jfEpisodesR.value : null;
  const tvdbId = Number(jf?.ProviderIds?.Tvdb) || jfDetail?.tvdbId || null;
  const tmdbId = Number(jf?.ProviderIds?.Tmdb) || (tvdbId ? await tmdbFindByTvdb(tvdbId).catch(() => null) : null);

  const localizedText = await localizedMediaText("series", { tmdbId, tvdbId });
  const monitor = tmdbId
    ? await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind: "series", tmdbId } } }).catch(() => null)
    : tvdbId
      ? await prisma.mediaMonitor.findFirst({ where: { kind: "series", tvdbId } }).catch(() => null)
      : null;
  const seasonMonitored = new Map(
    (monitor
      ? await prisma.mediaMonitorSeason.findMany({ where: { monitorId: monitor.id } }).catch(() => [])
      : []
    ).map((s) => [s.seasonNumber, s.monitored]),
  );
  const importedKeys = await importedEpisodeKeys(tmdbId, tvdbId);
  const jellyfinEpisodeByKey = new Map(
    (jfDetail?.seasons ?? []).flatMap((s) =>
      s.episodes.flatMap((e) => {
        const key = episodeKey(s.seasonNumber, e.episodeNumber);
        return key ? [[key, e] as const] : [];
      }),
    ),
  );
  let seasons: DetailSeason[] = (jfDetail?.seasons ?? []).map((s) => ({
    seasonNumber: s.seasonNumber,
    episodes: s.episodes.map((e) => ({
      seasonNumber: s.seasonNumber,
      episodeNumber: e.episodeNumber ?? 0,
      title: e.name,
      airDate: null,
      hasFile: true,
      quality: null,
      size: null,
      jellyfinId: e.id,
      played: e.played,
    })),
    fileCount: s.episodes.length,
    totalCount: s.episodes.length,
    monitored: seasonMonitored.get(s.seasonNumber) ?? monitor?.monitored ?? false,
  }));
  if (seasons.length === 0 && monitor) {
    const monitorEpisodes = await prisma.mediaMonitorEpisode.findMany({
      where: { monitorId: monitor.id },
      orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }],
    }).catch(() => []);
    const grouped = new Map<number, (typeof monitorEpisodes)[number][]>();
    for (const ep of monitorEpisodes) {
      if (!grouped.has(ep.seasonNumber)) grouped.set(ep.seasonNumber, []);
      grouped.get(ep.seasonNumber)!.push(ep);
    }
    seasons = [...grouped.entries()].map(([seasonNumber, eps]) => ({
      seasonNumber,
      episodes: eps.map((e) => {
        const key = episodeKey(e.seasonNumber, e.episodeNumber);
        const jfEp = key ? jellyfinEpisodeByKey.get(key) : null;
        return {
          seasonNumber,
          episodeNumber: e.episodeNumber,
          title: e.title ?? jfEp?.name ?? `Episode ${e.episodeNumber}`,
          airDate: e.airDate ? e.airDate.toISOString().slice(0, 10) : null,
          hasFile: Boolean(e.importedPath) || e.status === "downloaded" || (key ? importedKeys.has(key) || Boolean(jfEp) : false),
          quality: null,
          size: null,
          jellyfinId: jfEp?.id ?? null,
          played: Boolean(jfEp?.played),
        };
      }),
      fileCount: eps.filter((e) => {
        const key = episodeKey(e.seasonNumber, e.episodeNumber);
        return Boolean(e.importedPath) || e.status === "downloaded" || (key ? importedKeys.has(key) || jellyfinEpisodeByKey.has(key) : false);
      }).length,
      totalCount: eps.length,
      monitored: seasonMonitored.get(seasonNumber) ?? monitor.monitored,
    }));
  }
  if (seasons.length === 0 && tmdbId) {
    const seasonNumbers = await tmdbTvSeasons(tmdbId).catch(() => []);
    seasons = await Promise.all(seasonNumbers.map(async (seasonNumber) => {
      const eps = await tmdbSeason(tmdbId, seasonNumber).catch(() => []);
      return {
        seasonNumber,
        episodes: eps.map((e) => {
          const key = episodeKey(seasonNumber, e.episodeNumber);
          const jfEp = key ? jellyfinEpisodeByKey.get(key) : null;
          return {
            seasonNumber,
            episodeNumber: e.episodeNumber,
            title: e.title,
            airDate: e.airDate,
            hasFile: key ? importedKeys.has(key) || Boolean(jfEp) : false,
            quality: null,
            size: null,
            jellyfinId: jfEp?.id ?? null,
            played: Boolean(jfEp?.played),
          };
        }),
        fileCount: eps.filter((e) => {
          const key = episodeKey(seasonNumber, e.episodeNumber);
          return key ? importedKeys.has(key) || jellyfinEpisodeByKey.has(key) : false;
        }).length,
        totalCount: eps.length,
        monitored: seasonMonitored.get(seasonNumber) ?? monitor?.monitored ?? false,
      };
    }));
  }

  return {
    jellyfinId,
    title: String(localizedText.title ?? jf?.Name ?? jfDetail?.name ?? "—"),
    year: monitor?.year ?? jf?.ProductionYear ?? null,
    overview: localizedText.overview ?? jf?.Overview ?? null,
    genres: jf?.Genres ?? [],
    network: jf?.Studios?.[0]?.Name ?? null,
    status: jf?.Status ?? null,
    runtime: ticksToMin(jf?.RunTimeTicks),
    rating: jf?.CommunityRating ?? null,
    posterRemote: monitor?.poster ?? null,
    backdropRemote: monitor?.backdrop ?? null,
    tvdbId,
    inMonitor: Boolean(monitor),
    monitored: Boolean(monitor?.monitored),
    seasons,
  };
}

// Детальная страница фильма: Native monitor metadata + Jellyfin playback state.
export async function getMoviePageDetail(jellyfinId: string): Promise<MoviePageDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const jf = await jellyfinItem(jellyfinId);
  const tmdbId = Number(jf?.ProviderIds?.Tmdb) || null;
  const monitor = tmdbId
    ? await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind: "movie", tmdbId } } }).catch(() => null)
    : null;
  const localizedText = await localizedMediaText("movie", { tmdbId });
  const hasJellyfinMovie = jf?.Type === "Movie";
  return {
    jellyfinId,
    title: String(localizedText.title ?? jf?.Name ?? "—"),
    year: monitor?.year ?? jf?.ProductionYear ?? null,
    overview: localizedText.overview ?? jf?.Overview ?? null,
    genres: jf?.Genres ?? [],
    studio: jf?.Studios?.[0]?.Name ?? null,
    status: jf?.Status ?? null,
    runtime: ticksToMin(jf?.RunTimeTicks),
    rating: jf?.CommunityRating ?? null,
    posterRemote: monitor?.poster ?? null,
    backdropRemote: monitor?.backdrop ?? null,
    tmdbId,
    inMonitor: Boolean(monitor),
    monitored: Boolean(monitor?.monitored),
    hasFile: hasJellyfinMovie,
    quality: null,
    size: null,
  };
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
  category?: string;
  save_path?: string;
}

export async function qbittorrentDownloads(): Promise<DownloadItem[]> {
  if (!config.media.qbittorrent.configured) return [];
  const sid = await qbLogin();
  const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/info`, {
    headers: sid ? { Cookie: sid } : {},
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`qBittorrent info ${res.status}`);
  const torrents = (await res.json()) as QbTorrent[];
  const hashes = torrents.map((t) => t.hash?.toLowerCase()).filter(Boolean) as string[];
  const tracked = hashes.length
    ? await prisma.mediaTorrent.findMany({
        where: { infohash: { in: hashes } },
        select: { infohash: true, contentType: true },
      }).catch(() => [])
    : [];
  const contentTypeByHash = new Map(
    tracked
      .filter((t) => t.contentType === "movie" || t.contentType === "series")
      .map((t) => [t.infohash.toLowerCase(), t.contentType as "movie" | "series"]),
  );
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
    category: t.category,
    savePath: t.save_path,
    contentType: t.hash ? contentTypeByHash.get(t.hash.toLowerCase()) : undefined,
  }));
}

// Резолв http(s)-источника: некоторые Torznab индексеры отдают downloadUrl,
// который qBittorrent (в изолированной docker-сети) не видит. Поэтому .torrent тащит
// бэкенд, а в qBittorrent уже грузим байты файлом. Часть
// индексеров редиректит на magnet — ловим это вручную (maxRedirections:0).
export async function resolveTorrent(
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
async function assertQbAdded(res: Response): Promise<string[]> {
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
    return Array.isArray(json?.added_torrent_ids)
      ? json.added_torrent_ids.map((id) => String(id).toLowerCase()).filter(Boolean)
      : [];
  } else if (/^fails/i.test(text)) {
    throw new Error("qBittorrent отклонил торрент");
  }
  return [];
}

// Добавить торрент в qBittorrent с опциями (paused/category/savePath). Базовый
// метод — qbAdd и пофайловый граб (qbApplySelection) идут через него.
export async function qbAddRaw(
  urlOrMagnet: string,
  opts: { paused?: boolean; category?: string; savePath?: string } = {},
): Promise<string[]> {
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  const sid = await qbLogin();
  const addUrl = `${config.media.qbittorrent.url}/api/v2/torrents/add`;
  const resolved = await resolveTorrent(urlOrMagnet);

  // Доп. поля: paused (4.x) + stopped (5.x), category, savepath.
  const extra: Record<string, string> = {};
  if (opts.paused) { extra.paused = "true"; extra.stopped = "true"; }
  if (opts.category) extra.category = opts.category;
  if (opts.savePath) extra.savepath = opts.savePath;

  let res: Response;
  if (resolved.magnet) {
    res = await fetch(addUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sid ? { Cookie: sid } : {}) },
      body: new URLSearchParams({ urls: resolved.magnet, ...extra }),
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
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    res = await fetch(addUrl, {
      method: "POST",
      headers: { ...(sid ? { Cookie: sid } : {}) },
      body: fd,
      signal: AbortSignal.timeout(15_000),
    });
  }
  const addedIds = await assertQbAdded(res);
  cache = null;
  return addedIds;
}

// Добавить торрент в qBittorrent (magnet или http(s) .torrent URL).
export async function qbAdd(urlOrMagnet: string): Promise<void> {
  await qbAddRaw(urlOrMagnet);
}

// ── qBittorrent: пофайловый контроль (Media v2) ──────────────────────────
export interface QbFile { index: number; name: string; size: number; priority: number; progress: number; }

// Список файлов торрента. Пустой массив = торрента нет или метаданные ещё не пришли.
// Старые qB не отдают index → берём позицию в массиве (== порядок файлов в торренте).
export async function qbFiles(hash: string): Promise<QbFile[]> {
  if (!config.media.qbittorrent.configured) return [];
  const sid = await qbLogin();
  const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/files?hash=${hash}`, {
    headers: sid ? { Cookie: sid } : {},
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`qBittorrent files ${res.status}`);
  const arr = (await res.json()) as any[];
  if (!Array.isArray(arr)) return [];
  return arr.map((f, i) => ({
    index: Number.isFinite(f.index) ? Number(f.index) : i,
    name: String(f.name ?? ""),
    size: Number(f.size ?? 0),
    priority: Number(f.priority ?? 1),
    progress: Number(f.progress ?? 0),
  }));
}

// Выставить приоритет файлам (0 = не качать, 1 = обычный). Индексы — qB file ids.
export async function qbSetFilePrio(hash: string, indexes: number[], priority: number): Promise<void> {
  if (!indexes.length) return;
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  const sid = await qbLogin();
  const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/filePrio`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sid ? { Cookie: sid } : {}) },
    body: new URLSearchParams({ hash, id: indexes.join("|"), priority: String(priority) }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`qBittorrent filePrio ${res.status}`);
}

const qbBasename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;

// Применить пофайловый выбор: качаем только wanted-файлы (остальные prio 0).
// Если торрента нет в qB — добавляем на паузе, ждём метаданные, ставим приоритеты,
// затем resume. wantedIndexes — индексы из предпросмотра (files[].fileIndex).
export async function qbApplySelection(params: {
  infohash: string;
  source?: string;
  files: { fileIndex: number; path: string }[];
  wantedIndexes: number[];
  category?: string;
  savePath?: string;
}): Promise<{ infohash: string; added: boolean }> {
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  const hash = params.infohash.toLowerCase();
  let qf = await qbFiles(hash);
  let added = false;

  if (qf.length === 0) {
    if (!params.source) throw new Error("Торрент не найден в qBittorrent и нет источника для добавления");
    await qbAddRaw(params.source, { paused: true, category: params.category, savePath: params.savePath });
    added = true;
    for (let i = 0; i < 25 && qf.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      qf = await qbFiles(hash);
    }
    if (qf.length === 0) {
      await qbAction(hash, "resume").catch(() => {});
      throw new Error("qBittorrent ещё не получил метаданные торрента — повтори выбор через минуту");
    }
  }

  // Сопоставляем выбранные preview-пути с файлами qB (точное совпадение → basename).
  const wantedPaths = new Set(
    params.files.filter((f) => params.wantedIndexes.includes(f.fileIndex)).map((f) => f.path),
  );
  const wantedBase = new Set([...wantedPaths].map(qbBasename));
  const wanted: number[] = [];
  const unwanted: number[] = [];
  for (const f of qf) {
    const hit = wantedPaths.has(f.name) || wantedBase.has(qbBasename(f.name));
    (hit ? wanted : unwanted).push(f.index);
  }
  if (unwanted.length) await qbSetFilePrio(hash, unwanted, 0);
  if (wanted.length) await qbSetFilePrio(hash, wanted, 1);
  await qbAction(hash, "resume").catch(() => {});
  cache = null;
  return { infohash: hash, added };
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

export interface CalendarItem {
  kind: "movie" | "series";
  title: string;
  externalId: number | null; // tvdbId (series) | tmdbId (movie) — для monitor/поиска
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  airDate: string | null;
  hasFile: boolean;
  monitored: boolean;
}

// ── Продолжить просмотр + единый поиск (discovery) ──────────────────────────
export interface ResumeItem {
  id: string;
  title: string;
  kind: "movie" | "episode";
  positionPct: number;
  year: number | null;
  seriesId: string | null;
}

async function resolveResumeSeriesId(item: {
  Id: string;
  Type?: string;
  SeriesId?: string;
}): Promise<string | null> {
  if (item.Type === "Movie") return null;
  if (item.SeriesId) return item.SeriesId;
  const detail = await jellyfinItem(item.Id);
  return detail?.SeriesId ?? null;
}

// «Продолжить просмотр» из Jellyfin — недосмотренные фильмы/эпизоды с позицией.
export async function getContinueWatching(): Promise<ResumeItem[]> {
  if (!config.media.jellyfin.configured) return [];
  const userId = await jellyfinUserId();
  if (!userId) return [];
  const url = new URL(`${config.media.jellyfin.url}/Users/${userId}/Items/Resume`);
  url.searchParams.set("Limit", "20");
  url.searchParams.set("MediaTypes", "Video");
  url.searchParams.set("Recursive", "true");
  url.searchParams.set("Fields", "SeriesName,SeriesId,ParentId,UserData,RunTimeTicks,ProductionYear");
  const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Jellyfin Resume ${res.status}`);
  const body = (await res.json()) as {
    Items?: {
      Id: string; Name?: string; SeriesName?: string; SeriesId?: string; ParentId?: string; Type?: string;
      ProductionYear?: number; RunTimeTicks?: number;
      UserData?: { PlaybackPositionTicks?: number };
    }[];
  };
  return Promise.all((body.Items ?? []).map(async (it) => {
    const runtime = it.RunTimeTicks ?? 0;
    const pos = it.UserData?.PlaybackPositionTicks ?? 0;
    const kind = it.Type === "Movie" ? "movie" as const : "episode" as const;
    return {
      id: it.Id,
      title: it.SeriesName ? `${it.SeriesName} — ${it.Name ?? ""}` : it.Name ?? "—",
      kind,
      positionPct: runtime > 0 ? Math.round((pos / runtime) * 100) : 0,
      year: it.ProductionYear ?? null,
      seriesId: kind === "movie" ? null : await resolveResumeSeriesId(it),
    };
  }));
}

// Недавно просмотренные тайтлы (seed для «Потому что вы смотрели»). Привязка строго
// по Jellyfin ProviderIds (Tmdb для фильмов, Tmdb/Tvdb для сериалов) — без угадывания
// по названию. Эпизоды сворачиваются к сериалу. Возвращает до `limit` уникальных тайтлов.
export interface WatchSeed {
  kind: "movie" | "series";
  title: string;
  tmdbId: number | null;
  tvdbId: number | null;
}

export async function getRecentlyWatchedSeeds(limit = 6): Promise<WatchSeed[]> {
  if (!config.media.jellyfin.configured) return [];
  const userId = await jellyfinUserId();
  if (!userId) return [];
  const url = new URL(`${config.media.jellyfin.url}/Users/${userId}/Items`);
  url.searchParams.set("Limit", "40");
  url.searchParams.set("Recursive", "true");
  url.searchParams.set("IncludeItemTypes", "Movie,Episode");
  url.searchParams.set("Filters", "IsPlayed");
  url.searchParams.set("SortBy", "DatePlayed");
  url.searchParams.set("SortOrder", "Descending");
  url.searchParams.set("Fields", "ProviderIds,SeriesId,SeriesName,SeriesProviderIds");
  const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Jellyfin played ${res.status}`);
  const body = (await res.json()) as {
    Items?: {
      Id: string; Name?: string; Type?: string;
      ProviderIds?: Record<string, string>;
      SeriesId?: string; SeriesName?: string;
      SeriesProviderIds?: Record<string, string>;
    }[];
  };
  const seeds: WatchSeed[] = [];
  const seen = new Set<string>();
  for (const it of body.Items ?? []) {
    if (it.Type === "Movie") {
      const tmdbId = Number(it.ProviderIds?.Tmdb) || null;
      if (!tmdbId) continue;
      const key = `m${tmdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ kind: "movie", title: it.Name ?? "—", tmdbId, tvdbId: null });
    } else {
      const tmdbId = Number(it.SeriesProviderIds?.Tmdb) || null;
      const tvdbId = Number(it.SeriesProviderIds?.Tvdb) || null;
      if (!tmdbId && !tvdbId) continue;
      const key = `s${it.SeriesId ?? tmdbId ?? tvdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ kind: "series", title: it.SeriesName ?? "—", tmdbId, tvdbId });
    }
    if (seeds.length >= limit) break;
  }
  return seeds;
}

export interface UnifiedSearch {
  inLibrary: LibraryItem[];
  discover: unknown[];
  releases: SearchResult[];
}

// Единый поиск: библиотека Jellyfin. Discovery/release search живут в native API
// на TMDB + Jackett и вызываются отдельными маршрутами.
export async function unifiedSearch(q: string): Promise<UnifiedSearch> {
  const term = q.trim().toLowerCase();
  if (!term) return { inLibrary: [], discover: [], releases: [] };
  const [lib] = await Promise.allSettled([getLibrary()]);
  const inLibrary = (lib.status === "fulfilled" ? lib.value : [])
    .filter((it) => it.name.toLowerCase().includes(term))
    .slice(0, 8);
  return { inLibrary, discover: [], releases: [] };
}

// ── Сводка ────────────────────────────────────────────────────────────────
export async function getMedia(): Promise<MediaData> {
  if (!config.media.configured) {
    return { configured: false, torrserver: false, tmdb: false, nowPlaying: [], downloads: [] };
  }
  if (cache && Date.now() - cache.at < 8_000) return cache.data;

  const [jf, qb] = await Promise.allSettled([
    jellyfinNowPlaying(),
    qbittorrentDownloads(),
  ]);

  const nowPlaying = jf.status === "fulfilled" ? jf.value : [];
  const downloads = qb.status === "fulfilled" ? qb.value : [];

  const data: MediaData = {
    configured: true,
    torrserver: config.media.torrserver.configured,
    tmdb: config.media.tmdb.configured,
    nowPlaying,
    downloads,
  };
  cache = { data, at: Date.now() };
  return data;
}
