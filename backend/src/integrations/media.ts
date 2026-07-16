// Медиа-стек: Jellyfin (что играет + библиотека + плеер) + qBittorrent.
// Торрент-пайплайн упрощён: выбранные релизы качаются сразу в movies/tv,
// а nativeMedia.ts хранит только lightweight registry TMDB↔torrent↔Jellyfin.
// Каждый источник опционален и изолирован
// через Promise.allSettled — падение одного не ломает остальные. Не настроено → "Not configured".

import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { jellyfinUserHeaders } from "./jellyfinUsers.js";
import { tmdbDetails, tmdbFindByTvdb, tmdbSeason, tmdbTvSeasons, tmdbTvToTvdb } from "./tmdb.js";
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
  mediaTitle?: string;
  mediaYear?: number | null;
  mediaPoster?: string | null;
  mediaTmdbId?: number;
  downloadId?: string; // qB-хеш — ключ для ручного импорта
  importPending?: boolean; // legacy UI field; simplified pipeline does not set it
  importMessage?: string;
}

export interface MediaData {
  configured: boolean;
  torrserver: boolean; // TorrServer настроен → фронт показывает блок «Смотреть онлайн»
  tmdb: boolean; // TMDB настроен → дискавери через TMDB
  nowPlaying: NowPlaying[];
  downloads: DownloadItem[];
}

export interface MediaUserContext {
  appUserId?: string | null;
  allowFallback?: boolean;
}

export interface JellyfinPlaybackContext {
  userId: string;
  accessToken: string | null;
}

export interface PlaybackPathInfo {
  url: string;
  playSessionId: string | null;
  mediaSourceId: string | null;
  linked: boolean;
  reason?: "jellyfin_user_required" | "jellyfin_auth_required";
}

export interface PlaybackReportResult {
  linked: boolean;
  reason?: "jellyfin_user_required" | "jellyfin_auth_required";
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

// ── Детальные страницы (TMDB + Jellyfin playback state) ──────
export interface DetailEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string | null;
  hasFile: boolean;
  quality: string | null;
  size: number | null;
  stillRemote: string | null;
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
  tmdbId: number | null;
  tvdbId: number | null;
  inLibrary: boolean;
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
  inLibrary: boolean;
  inMonitor: boolean;
  monitored: boolean;
  hasFile: boolean;
  quality: string | null;
  size: number | null;
}

export type SeriesTitleIdType = "tmdb" | "tvdb" | "auto";

export interface ReleaseMatch {
  targetYear: number | null;
  allowedYears: number[];
  declaredYears: number[];
  yearStatus: "match" | "mismatch" | "unknown" | "not_applicable";
  seasonStatus: "match" | "mismatch" | "unknown" | "not_applicable";
  confidence: "high" | "medium" | "low";
  block: boolean;
  reasons: string[];
  warnings: string[];
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
  match?: ReleaseMatch;
  parsed?: unknown;
  inferredSeason?: number | null;
}

export interface PlayDevice {
  id: string;
  deviceName: string;
  client: string;
  nowPlaying: string | null;
}

let cache: { data: MediaData; at: number } | null = null;

export function invalidateMediaCache(): void {
  cache = null;
  jfUserId = null;
}

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

function ticksFromSeconds(seconds?: number | null): number {
  return Math.max(0, Math.round(Number(seconds ?? 0) * 10_000_000));
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
  const tmdb = await tmdbLibraryDetail(kind === "movie" ? "Movie" : "Series", ids.tmdbId ?? null);
  return {
    title: tmdb?.title ?? null,
    overview: tmdb?.overview ?? null,
  };
}

// Каталог библиотеки: все фильмы + все сериалы (сериал — одна плитка, эпизоды
// видны в drill-down). Movies и Series тащим отдельными запросами через allSettled.
export async function getLibrary(ctx: MediaUserContext = {}): Promise<LibraryItem[]> {
  if (!config.media.jellyfin.configured) return [];
  const userId = await jellyfinUserId(ctx);
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
      const localizedName =
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
export async function getSeriesDetail(seriesId: string, ctx: MediaUserContext = {}): Promise<SeriesDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const userId = await jellyfinUserId(ctx);
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
async function jellyfinItem(id: string, ctx: MediaUserContext = {}): Promise<JfFullItem | null> {
  if (!config.media.jellyfin.configured) return null;
  const userId = await jellyfinUserId(ctx);
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

async function libraryItemForTitle(
  kind: "movie" | "series",
  ids: { tmdbId: number; tvdbId?: number | null },
  ctx: MediaUserContext = {},
): Promise<LibraryItem | null> {
  if (!config.media.jellyfin.configured) return null;
  const library = await getLibrary(ctx).catch(() => []);
  const type = kind === "series" ? "Series" : "Movie";
  return library.find((item) =>
    item.type === type &&
    (item.tmdbId === ids.tmdbId || (kind === "series" && ids.tvdbId != null && item.tvdbId === ids.tvdbId)),
  ) ?? null;
}

async function registryJellyfinId(
  kind: "movie" | "series",
  tmdbId: number,
): Promise<string | null> {
  const title = await prisma.mediaTitle.findUnique({
    where: { kind_tmdbId: { kind, tmdbId } },
    select: { jellyfinId: true },
  }).catch(() => null);
  return title?.jellyfinId ?? null;
}

async function registryTitleExists(
  kind: "movie" | "series",
  tmdbId: number,
): Promise<boolean> {
  const title = await prisma.mediaTitle.findUnique({
    where: { kind_tmdbId: { kind, tmdbId } },
    select: { id: true },
  }).catch(() => null);
  return Boolean(title);
}

async function updateRegistryJellyfinLink(
  kind: "movie" | "series",
  tmdbId: number,
  tvdbId: number | null,
  jellyfinId: string | null,
): Promise<void> {
  if (!jellyfinId) return;
  await prisma.mediaTitle.updateMany({
    where: { kind, tmdbId },
    data: { jellyfinId, ...(kind === "series" ? { tvdbId } : {}) },
  }).catch(() => {});
}

async function resolveJellyfinIdForTitle(
  kind: "movie" | "series",
  ids: { tmdbId: number; tvdbId?: number | null },
  ctx: MediaUserContext = {},
): Promise<string | null> {
  const libraryItem = await libraryItemForTitle(kind, ids, ctx);
  if (libraryItem?.id) return libraryItem.id;
  return registryJellyfinId(kind, ids.tmdbId);
}

function jellyfinEpisodeMap(jfDetail: SeriesDetail | null): Map<string, SeriesEpisode> {
  return new Map(
    (jfDetail?.seasons ?? []).flatMap((s) =>
      s.episodes.flatMap((e) => {
        const key = episodeKey(s.seasonNumber, e.episodeNumber);
        return key ? [[key, e] as const] : [];
      }),
    ),
  );
}

async function buildTmdbSeasons(
  tmdbId: number,
  jellyfinEpisodeByKey: Map<string, SeriesEpisode>,
): Promise<DetailSeason[]> {
  const seasonNumbers = await tmdbTvSeasons(tmdbId).catch(() => []);
  return Promise.all(seasonNumbers.map(async (seasonNumber) => {
    const eps = await tmdbSeason(tmdbId, seasonNumber).catch(() => []);
    return {
      seasonNumber,
      episodes: eps.map((e) => {
        const key = episodeKey(seasonNumber, e.episodeNumber);
        const jfEp = key ? jellyfinEpisodeByKey.get(key) : null;
        return {
          seasonNumber,
          episodeNumber: e.episodeNumber,
          title: e.title || jfEp?.name || `Episode ${e.episodeNumber}`,
          airDate: e.airDate,
          hasFile: Boolean(jfEp),
          quality: null,
          size: null,
          stillRemote: e.still,
          jellyfinId: jfEp?.id ?? null,
          played: Boolean(jfEp?.played),
        };
      }),
      fileCount: eps.filter((e) => {
        const key = episodeKey(seasonNumber, e.episodeNumber);
        return key ? jellyfinEpisodeByKey.has(key) : false;
      }).length,
      totalCount: eps.length,
      monitored: false,
    };
  }));
}

function seasonsFromJellyfinOnly(jfDetail: SeriesDetail | null): DetailSeason[] {
  return (jfDetail?.seasons ?? []).map((s) => ({
    seasonNumber: s.seasonNumber,
    episodes: s.episodes.map((e) => ({
      seasonNumber: s.seasonNumber,
      episodeNumber: e.episodeNumber ?? 0,
      title: e.name,
      airDate: null,
      hasFile: true,
      quality: null,
      size: null,
      stillRemote: null,
      jellyfinId: e.id,
      played: e.played,
    })),
    fileCount: s.episodes.length,
    totalCount: s.episodes.length,
    monitored: false,
  }));
}

async function resolveSeriesTitleId(id: number, idType: SeriesTitleIdType): Promise<number> {
  if (idType === "tmdb") return id;
  if (idType === "tvdb") {
    const tmdbId = await tmdbFindByTvdb(id).catch(() => null);
    if (!tmdbId) throw new Error(`series tvdbId ${id} not found in TMDB`);
    return tmdbId;
  }
  const tmdbDetail = await tmdbDetails("series", id).catch(() => null);
  if (tmdbDetail) return id;
  const tmdbId = await tmdbFindByTvdb(id).catch(() => null);
  if (!tmdbId) throw new Error(`series id ${id} not found as TMDB or TVDB`);
  return tmdbId;
}

export async function getMediaTitleDetail(
  kind: "movie" | "series",
  id: number,
  opts: { idType?: SeriesTitleIdType } = {},
  ctx: MediaUserContext = {},
): Promise<MoviePageDetail | SeriesPageDetail> {
  if (!config.media.tmdb.configured) throw new Error("TMDB не настроен");
  const tmdbId = kind === "series" ? await resolveSeriesTitleId(id, opts.idType ?? "tmdb") : id;
  const detail = await tmdbDetails(kind, tmdbId);
  if (!detail) throw new Error(`${kind} not found in TMDB`);

  if (kind === "movie") {
    const jellyfinId = await resolveJellyfinIdForTitle("movie", { tmdbId }, ctx);
    const jf = jellyfinId && config.media.jellyfin.configured ? await jellyfinItem(jellyfinId, ctx) : null;
    const inRegistry = await registryTitleExists("movie", tmdbId);
    await updateRegistryJellyfinLink("movie", tmdbId, null, jf?.Type === "Movie" ? jellyfinId : null);
    return {
      jellyfinId: jf?.Type === "Movie" && jellyfinId ? jellyfinId : "",
      title: detail.title,
      year: detail.year,
      overview: detail.overview,
      genres: jf?.Genres?.length ? jf.Genres : detail.genres,
      studio: jf?.Studios?.[0]?.Name ?? null,
      status: jf?.Status ?? null,
      runtime: ticksToMin(jf?.RunTimeTicks) ?? detail.runtime,
      rating: jf?.CommunityRating ?? detail.rating,
      posterRemote: detail.poster,
      backdropRemote: detail.backdrop,
      tmdbId,
      inLibrary: inRegistry || jf?.Type === "Movie",
      inMonitor: false,
      monitored: false,
      hasFile: jf?.Type === "Movie",
      quality: null,
      size: null,
    };
  }

  const tvdbId = await tmdbTvToTvdb(tmdbId).catch(() => null);
  const jellyfinId = await resolveJellyfinIdForTitle("series", { tmdbId, tvdbId }, ctx);
  const inRegistry = await registryTitleExists("series", tmdbId);
  const [jfItemR, jfEpisodesR] = await Promise.allSettled([
    jellyfinId && config.media.jellyfin.configured ? jellyfinItem(jellyfinId, ctx) : Promise.resolve(null),
    jellyfinId && config.media.jellyfin.configured ? getSeriesDetail(jellyfinId, ctx) : Promise.resolve(null),
  ]);
  const jf = jfItemR.status === "fulfilled" ? jfItemR.value : null;
  const jfDetail = jfEpisodesR.status === "fulfilled" ? jfEpisodesR.value : null;
  const resolvedTvdbId = tvdbId ?? (Number(jf?.ProviderIds?.Tvdb) || jfDetail?.tvdbId || null);
  await updateRegistryJellyfinLink("series", tmdbId, resolvedTvdbId, jf?.Type === "Series" && jellyfinId ? jellyfinId : null);

  const jellyfinEpisodes = jellyfinEpisodeMap(jfDetail);
  let seasons = await buildTmdbSeasons(tmdbId, jellyfinEpisodes);
  if (seasons.length === 0 && jfDetail?.seasons?.length) seasons = seasonsFromJellyfinOnly(jfDetail);

  return {
    jellyfinId: jf?.Type === "Series" && jellyfinId ? jellyfinId : "",
    title: detail.title,
    year: detail.year ?? jf?.ProductionYear ?? null,
    overview: detail.overview ?? jf?.Overview ?? null,
    genres: jf?.Genres?.length ? jf.Genres : detail.genres,
    network: jf?.Studios?.[0]?.Name ?? null,
    status: jf?.Status ?? null,
    runtime: ticksToMin(jf?.RunTimeTicks) ?? detail.runtime,
    rating: jf?.CommunityRating ?? detail.rating,
    posterRemote: detail.poster,
    backdropRemote: detail.backdrop,
    tmdbId,
    tvdbId: resolvedTvdbId,
    inLibrary: inRegistry || jf?.Type === "Series",
    inMonitor: false,
    monitored: false,
    seasons,
  };
}

// Детальная страница сериала: TMDB metadata + Jellyfin episodes/play state.
export async function getSeriesPageDetail(jellyfinId: string, ctx: MediaUserContext = {}): Promise<SeriesPageDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const [jfItemR, jfEpisodesR] = await Promise.allSettled([
    jellyfinItem(jellyfinId, ctx),
    getSeriesDetail(jellyfinId, ctx),
  ]);
  const jf = jfItemR.status === "fulfilled" ? jfItemR.value : null;
  const jfDetail = jfEpisodesR.status === "fulfilled" ? jfEpisodesR.value : null;
  const tvdbId = Number(jf?.ProviderIds?.Tvdb) || jfDetail?.tvdbId || null;
  const tmdbId = Number(jf?.ProviderIds?.Tmdb) || (tvdbId ? await tmdbFindByTvdb(tvdbId).catch(() => null) : null);

  const localizedText = await localizedMediaText("series", { tmdbId, tvdbId });
  const jellyfinEpisodeByKey = new Map(
    (jfDetail?.seasons ?? []).flatMap((s) =>
      s.episodes.flatMap((e) => {
        const key = episodeKey(s.seasonNumber, e.episodeNumber);
        return key ? [[key, e] as const] : [];
      }),
    ),
  );

  let seasons: DetailSeason[] = [];
  if (tmdbId) {
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
            title: e.title || jfEp?.name || `Episode ${e.episodeNumber}`,
            airDate: e.airDate,
            hasFile: Boolean(jfEp),
            quality: null,
            size: null,
            stillRemote: e.still,
            jellyfinId: jfEp?.id ?? null,
            played: Boolean(jfEp?.played),
          };
        }),
        fileCount: eps.filter((e) => {
          const key = episodeKey(seasonNumber, e.episodeNumber);
          return key ? jellyfinEpisodeByKey.has(key) : false;
        }).length,
        totalCount: eps.length,
        monitored: false,
      };
    }));
  }
  if (seasons.length === 0 && jfDetail?.seasons?.length) {
    seasons = jfDetail.seasons.map((s) => ({
      seasonNumber: s.seasonNumber,
      episodes: s.episodes.map((e) => ({
        seasonNumber: s.seasonNumber,
        episodeNumber: e.episodeNumber ?? 0,
        title: e.name,
        airDate: null,
        hasFile: true,
        quality: null,
        size: null,
        stillRemote: null,
        jellyfinId: e.id,
        played: e.played,
      })),
      fileCount: s.episodes.length,
      totalCount: s.episodes.length,
      monitored: false,
    }));
  }

  return {
    jellyfinId,
    title: String(localizedText.title ?? jf?.Name ?? jfDetail?.name ?? "—"),
    year: jf?.ProductionYear ?? null,
    overview: localizedText.overview ?? jf?.Overview ?? null,
    genres: jf?.Genres ?? [],
    network: jf?.Studios?.[0]?.Name ?? null,
    status: jf?.Status ?? null,
    runtime: ticksToMin(jf?.RunTimeTicks),
    rating: jf?.CommunityRating ?? null,
    posterRemote: null,
    backdropRemote: null,
    tmdbId,
    tvdbId,
    inLibrary: true,
    inMonitor: false,
    monitored: false,
    seasons,
  };
}

// Детальная страница фильма: TMDB metadata + Jellyfin playback state.
export async function getMoviePageDetail(jellyfinId: string, ctx: MediaUserContext = {}): Promise<MoviePageDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const jf = await jellyfinItem(jellyfinId, ctx);
  const tmdbId = Number(jf?.ProviderIds?.Tmdb) || null;
  const localizedText = await localizedMediaText("movie", { tmdbId });
  const hasJellyfinMovie = jf?.Type === "Movie";
  return {
    jellyfinId,
    title: String(localizedText.title ?? jf?.Name ?? "—"),
    year: jf?.ProductionYear ?? null,
    overview: localizedText.overview ?? jf?.Overview ?? null,
    genres: jf?.Genres ?? [],
    studio: jf?.Studios?.[0]?.Name ?? null,
    status: jf?.Status ?? null,
    runtime: ticksToMin(jf?.RunTimeTicks),
    rating: jf?.CommunityRating ?? null,
    posterRemote: null,
    backdropRemote: null,
    tmdbId,
    inLibrary: true,
    inMonitor: false,
    monitored: false,
    hasFile: hasJellyfinMovie,
    quality: null,
    size: null,
  };
}

// Первый userId Jellyfin — legacy fallback только для служебного APP_TOKEN/Hermes.
let jfUserId: string | null = null;
async function firstJellyfinUserId(): Promise<string | null> {
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

async function jellyfinUserId(ctx: MediaUserContext = {}): Promise<string | null> {
  const appUserId = ctx.appUserId;
  if (appUserId && appUserId !== "app-token") {
    const user = await prisma.appUser.findUnique({
      where: { id: appUserId },
      select: { jellyfinUserId: true },
    }).catch(() => null);
    return user?.jellyfinUserId ?? null;
  }
  return ctx.allowFallback || appUserId === "app-token" ? firstJellyfinUserId() : null;
}

async function jellyfinPlaybackContext(ctx: MediaUserContext = {}): Promise<JellyfinPlaybackContext | null> {
  const appUserId = ctx.appUserId;
  if (appUserId && appUserId !== "app-token") {
    const user = await prisma.appUser.findUnique({
      where: { id: appUserId },
      select: { jellyfinUserId: true, jellyfinAccessToken: true },
    }).catch(() => null);
    return user?.jellyfinUserId
      ? { userId: user.jellyfinUserId, accessToken: user.jellyfinAccessToken ?? null }
      : null;
  }
  const userId = ctx.allowFallback || appUserId === "app-token" ? await firstJellyfinUserId() : null;
  return userId ? { userId, accessToken: null } : null;
}

// DeviceProfile с пустыми DirectPlayProfiles заставляет Jellyfin отдать HLS-транскод,
// который играется в любом браузере. Возвращаем путь под наш прокси (api_key вырезан —
// его подставит прокси заголовком).
export async function getPlaybackPath(itemId: string, ctx: MediaUserContext = {}): Promise<PlaybackPathInfo> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const playbackContext = await jellyfinPlaybackContext(ctx);
  const userId = playbackContext?.userId ?? null;
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
    headers: {
      ...(playbackContext?.accessToken ? jellyfinUserHeaders(playbackContext.accessToken) : jfHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...deviceProfile,
      ...(userId ? { UserId: userId } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Jellyfin PlaybackInfo responded ${res.status}`);
  const info = (await res.json()) as {
    PlaySessionId?: string;
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
  return {
    url: `/api/media/jellyfin${cleaned.startsWith("/") ? "" : "/"}${cleaned}`,
    playSessionId: info.PlaySessionId ?? null,
    mediaSourceId: src?.Id ?? itemId,
    linked: Boolean(playbackContext?.accessToken),
    reason: !playbackContext?.userId
      ? "jellyfin_user_required"
      : !playbackContext.accessToken
        ? "jellyfin_auth_required"
        : undefined,
  };
}

export type PlaybackEventKind = "start" | "progress" | "stop";

export async function reportPlaybackEvent(
  kind: PlaybackEventKind,
  input: {
    itemId: string;
    playSessionId?: string | null;
    mediaSourceId?: string | null;
    positionSeconds?: number | null;
    durationSeconds?: number | null;
    isPaused?: boolean;
  },
  ctx: MediaUserContext = {},
): Promise<PlaybackReportResult> {
  if (!config.media.jellyfin.configured) return { linked: false, reason: "jellyfin_user_required" };
  const playbackContext = await jellyfinPlaybackContext(ctx);
  if (!playbackContext?.userId) return { linked: false, reason: "jellyfin_user_required" };
  if (!playbackContext.accessToken) return { linked: false, reason: "jellyfin_auth_required" };
  const path =
    kind === "start" ? "/Sessions/Playing" :
    kind === "progress" ? "/Sessions/Playing/Progress" :
    "/Sessions/Playing/Stopped";
  const body = {
    ItemId: input.itemId,
    MediaSourceId: input.mediaSourceId ?? input.itemId,
    PlaySessionId: input.playSessionId ?? undefined,
    PlayMethod: "Transcode",
    CanSeek: true,
    IsPaused: Boolean(input.isPaused),
    PositionTicks: ticksFromSeconds(input.positionSeconds),
    RunTimeTicks: ticksFromSeconds(input.durationSeconds),
  };
  const res = await fetch(`${config.media.jellyfin.url}${path}`, {
    method: "POST",
    headers: { ...jellyfinUserHeaders(playbackContext.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok && res.status !== 204) throw new Error(`Jellyfin playback ${kind} responded ${res.status}`);
  await updateJellyfinUserDataProgress(
    playbackContext.userId,
    playbackContext.accessToken,
    input.itemId,
    input.positionSeconds,
    input.durationSeconds,
  );
  return { linked: true };
}

async function updateJellyfinUserDataProgress(
  userId: string,
  accessToken: string,
  itemId: string,
  positionSeconds?: number | null,
  durationSeconds?: number | null,
): Promise<void> {
  const positionTicks = ticksFromSeconds(positionSeconds);
  const duration = Number(durationSeconds ?? 0);
  const position = Number(positionSeconds ?? 0);
  const playedPercentage = duration > 0 ? Math.max(0, Math.min(100, (position / duration) * 100)) : null;
  const played = Boolean(playedPercentage != null && playedPercentage >= 90);
  const body = {
    ItemId: itemId,
    PlaybackPositionTicks: played ? 0 : positionTicks,
    ...(playedPercentage != null ? { PlayedPercentage: played ? 100 : playedPercentage } : {}),
    Played: played,
    LastPlayedDate: new Date().toISOString(),
  };
  const res = await fetch(`${config.media.jellyfin.url}/UserItems/${encodeURIComponent(itemId)}/UserData?userId=${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { ...jellyfinUserHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Jellyfin UserData progress responded ${res.status}`);
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
        select: {
          infohash: true,
          title: {
            select: {
              kind: true,
              tmdbId: true,
              title: true,
              year: true,
              poster: true,
            },
          },
        },
      }).catch(() => [])
    : [];
  const titleByHash = new Map(
    tracked.map((t) => [t.infohash.toLowerCase(), t.title]),
  );
  return torrents.map((t) => {
    const linkedTitle = t.hash ? titleByHash.get(t.hash.toLowerCase()) : undefined;
    const contentType = linkedTitle?.kind === "movie" || linkedTitle?.kind === "series"
      ? linkedTitle.kind
      : undefined;
    return {
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
      contentType,
      mediaTitle: linkedTitle?.title,
      mediaYear: linkedTitle?.year,
      mediaPoster: linkedTitle?.poster,
      mediaTmdbId: linkedTitle?.tmdbId,
    };
  });
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

export async function qbRenameFile(hash: string, oldPath: string, newPath: string): Promise<void> {
  if (!config.media.qbittorrent.configured) throw new Error("qBittorrent не настроен");
  const sid = await qbLogin();
  const res = await fetch(`${config.media.qbittorrent.url}/api/v2/torrents/renameFile`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(sid ? { Cookie: sid } : {}) },
    body: new URLSearchParams({ hash, oldPath, newPath }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`qBittorrent renameFile ${res.status}`);
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
  externalId: number | null; // tvdbId (series) | tmdbId (movie)
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

export interface MediaHomeHero {
  reason: "continue" | "new" | "watchlist" | "high_rated" | "fallback";
  label: string;
  kind: "movie" | "series" | "episode";
  itemId: string;
  jellyfinId: string | null;
  seriesId: string | null;
  tmdbId: number | null;
  title: string;
  year: number | null;
  progress: number | null;
}

export interface MediaHome {
  hero: MediaHomeHero | null;
}

async function resolveResumeSeriesId(item: {
  Id: string;
  Type?: string;
  SeriesId?: string;
}, ctx: MediaUserContext = {}): Promise<string | null> {
  if (item.Type === "Movie") return null;
  if (item.SeriesId) return item.SeriesId;
  const detail = await jellyfinItem(item.Id, ctx);
  return detail?.SeriesId ?? null;
}

// «Продолжить просмотр» из Jellyfin — недосмотренные фильмы/эпизоды с позицией.
export async function getContinueWatching(ctx: MediaUserContext = {}): Promise<ResumeItem[]> {
  if (!config.media.jellyfin.configured) return [];
  const userId = await jellyfinUserId(ctx);
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
      seriesId: kind === "movie" ? null : await resolveResumeSeriesId(it, ctx),
    };
  }));
}

export async function getMediaHome(ctx: MediaUserContext = {}): Promise<MediaHome> {
  const [resumeR, libraryR, prefsR] = await Promise.allSettled([
    getContinueWatching(ctx),
    getLibrary(ctx),
    import("./mediaPreferences.js").then((m) => m.listMediaPreferences("watchlist", ctx.appUserId)),
  ]);
  const resume = resumeR.status === "fulfilled" ? resumeR.value : [];
  const library = libraryR.status === "fulfilled" ? libraryR.value : [];
  const watchlist = prefsR.status === "fulfilled" ? prefsR.value : [];

  const firstResume = resume[0];
  if (firstResume) {
    return {
      hero: {
        reason: "continue",
        label: firstResume.kind === "episode" ? "Продолжить серию" : "Продолжить просмотр",
        kind: firstResume.kind,
        itemId: firstResume.id,
        jellyfinId: firstResume.id,
        seriesId: firstResume.seriesId,
        tmdbId: null,
        title: firstResume.title,
        year: firstResume.year,
        progress: firstResume.positionPct,
      },
    };
  }

  const newestRegistered = await prisma.mediaTitle.findFirst({
    where: { jellyfinId: { not: null } },
    orderBy: { updatedAt: "desc" },
  }).catch(() => null);
  const newest = newestRegistered
    ? library.find((item) => item.id === newestRegistered.jellyfinId || item.tmdbId === newestRegistered.tmdbId)
    : null;
  if (newest) {
    return {
      hero: {
        reason: "new",
        label: "Новое в библиотеке",
        kind: newest.type === "Series" ? "series" : "movie",
        itemId: newest.id,
        jellyfinId: newest.id,
        seriesId: newest.type === "Series" ? newest.id : null,
        tmdbId: newest.tmdbId,
        title: newest.name,
        year: newest.year,
        progress: null,
      },
    };
  }

  const watchlistIds = new Set(watchlist.map((item) => `${item.kind}:${item.tmdbId}`));
  const watchlistHit = library.find((item) => item.tmdbId && watchlistIds.has(`${item.type === "Series" ? "series" : "movie"}:${item.tmdbId}`));
  const highRated = [...library]
    .filter((item) => !item.played)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? library[0] ?? null;
  const picked = watchlistHit ?? highRated;
  if (!picked) return { hero: null };
  return {
    hero: {
      reason: watchlistHit ? "watchlist" : highRated ? "high_rated" : "fallback",
      label: watchlistHit ? "Из моего списка" : highRated ? "Высокий рейтинг" : "В библиотеке",
      kind: picked.type === "Series" ? "series" : "movie",
      itemId: picked.id,
      jellyfinId: picked.id,
      seriesId: picked.type === "Series" ? picked.id : null,
      tmdbId: picked.tmdbId,
      title: picked.name,
      year: picked.year,
      progress: null,
    },
  };
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

export async function getRecentlyWatchedSeeds(limit = 6, ctx: MediaUserContext = {}): Promise<WatchSeed[]> {
  if (!config.media.jellyfin.configured) return [];
  const userId = await jellyfinUserId(ctx);
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
export async function unifiedSearch(q: string, ctx: MediaUserContext = {}): Promise<UnifiedSearch> {
  const term = q.trim().toLowerCase();
  if (!term) return { inLibrary: [], discover: [], releases: [] };
  const [lib] = await Promise.allSettled([getLibrary(ctx)]);
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
