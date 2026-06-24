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
  downloadId?: string; // qB-хеш (Sonarr/Radarr) — ключ для ручного импорта
  importPending?: boolean; // скачано, но Sonarr/Radarr не смог импортировать (multi-season и т.п.)
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
  tvdbId: number | null; // series only — маппится на внутренний id Sonarr для поиска релизов
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

// ── Детальные страницы (Jellyfin + Sonarr/Radarr) ──────────────────────
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
  tvdbId: number | null;
  inArr: boolean;
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
  tmdbId: number | null;
  inArr: boolean;
  monitored: boolean;
  hasFile: boolean;
  quality: string | null;
  size: number | null;
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
  ProviderIds?: Record<string, string>;
  ChildCount?: number;
  UserData?: { Played?: boolean; UnplayedItemCount?: number };
}

// Каталог библиотеки: все фильмы + все сериалы (сериал — одна плитка, эпизоды
// видны в drill-down). Movies и Series тащим отдельными запросами через allSettled.
export async function getLibrary(): Promise<LibraryItem[]> {
  if (!config.media.jellyfin.configured) return [];
  const userId = await jellyfinUserId();
  const fetchItems = async (type: "Movie" | "Series"): Promise<LibraryItem[]> => {
    const url = new URL(`${config.media.jellyfin.url}/Items`);
    url.searchParams.set("Recursive", "true");
    url.searchParams.set("IncludeItemTypes", type);
    url.searchParams.set("SortBy", "SortName");
    url.searchParams.set("SortOrder", "Ascending");
    url.searchParams.set("Fields", "ProductionYear,ProviderIds,ChildCount");
    if (userId) url.searchParams.set("userId", userId);
    const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Jellyfin /Items(${type}) responded ${res.status}`);
    const body = (await res.json()) as { Items?: JfItem[] };
    return (body.Items ?? []).map((it) => ({
      id: it.Id,
      name: it.Name ?? "—",
      type,
      year: it.ProductionYear ?? null,
      tvdbId: type === "Series" ? Number(it.ProviderIds?.Tvdb) || null : null,
      childCount: type === "Series" ? it.ChildCount ?? null : null,
      played: Boolean(it.UserData?.Played),
      unplayed: type === "Series" ? Number(it.UserData?.UnplayedItemCount ?? 0) : 0,
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
  Overview?: string;
  Genres?: string[];
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
  url.searchParams.set("Fields", "Overview,Genres,ProviderIds,Studios,CommunityRating,ProductionYear,RunTimeTicks,Status");
  const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  return (await res.json()) as JfFullItem;
}

// Read-only поиск внутренней записи *arr по внешнему id (НЕ добавляет тайтл).
// movie → Radarr ?tmdbId; series → Sonarr ?tvdbId.
async function arrFindByExternalId(kind: "movie" | "series", externalId: number): Promise<Record<string, any> | null> {
  const cfg = arrCfg(kind);
  if (!cfg.configured || !externalId) return null;
  const param = kind === "movie" ? "tmdbId" : "tvdbId";
  const res = await fetch(`${cfg.url}/api/v3/${kind}?${param}=${externalId}`, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const list = (await res.json()) as Record<string, any>[];
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

// Все эпизоды сериала в Sonarr (вкл. отсутствующие) + инфа о файле/качестве.
async function sonarrEpisodes(seriesId: number): Promise<Record<string, any>[]> {
  const cfg = config.media.sonarr;
  if (!cfg.configured) return [];
  const res = await fetch(`${cfg.url}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  return (await res.json()) as Record<string, any>[];
}

const ticksToMin = (t?: number): number | null => (t && t > 0 ? Math.round(t / 600_000_000) : null);

// Построить сезоны с эпизодами/файлами из записи Sonarr, merged с Jellyfin-картой
// (S{n}E{n} → { id, played }). Общий хелпер: Jellyfin-keyed детальная страница и
// discover-страница по tvdbId используют один и тот же билдер.
async function buildSonarrSeasons(
  sonarr: Record<string, any>,
  jfMap: Map<string, { id: string; played: boolean }>,
): Promise<DetailSeason[]> {
  const seasonMonitored = new Map<number, boolean>();
  for (const s of (sonarr?.seasons ?? []) as any[]) {
    seasonMonitored.set(Number(s.seasonNumber), Boolean(s.monitored));
  }
  const eps = await sonarrEpisodes(sonarr.id);
  const map = new Map<number, DetailEpisode[]>();
  for (const e of eps) {
    const sn = Number(e.seasonNumber ?? 0);
    const en = Number(e.episodeNumber ?? 0);
    const jfHit = jfMap.get(`S${sn}E${en}`);
    if (!map.has(sn)) map.set(sn, []);
    map.get(sn)!.push({
      seasonNumber: sn,
      episodeNumber: en,
      title: String(e.title ?? "—"),
      airDate: e.airDateUtc ?? null,
      hasFile: Boolean(e.hasFile),
      quality: e.episodeFile?.quality?.quality?.name ?? null,
      size: e.episodeFile?.size ?? null,
      jellyfinId: jfHit?.id ?? null,
      played: jfHit?.played ?? false,
    });
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([sn, list]) => ({
    seasonNumber: sn,
    episodes: list.sort((a, b) => a.episodeNumber - b.episodeNumber),
    fileCount: list.filter((x) => x.hasFile).length,
    totalCount: list.length,
    monitored: seasonMonitored.get(sn) ?? false,
  }));
}

// Детальная страница сериала: Sonarr (метаданные + полный список эпизодов с
// файлом/качеством/датой) merged с Jellyfin (played + id для плеера).
export async function getSeriesPageDetail(jellyfinId: string): Promise<SeriesPageDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const [jfItemR, jfEpisodesR] = await Promise.allSettled([
    jellyfinItem(jellyfinId),
    getSeriesDetail(jellyfinId),
  ]);
  const jf = jfItemR.status === "fulfilled" ? jfItemR.value : null;
  const jfDetail = jfEpisodesR.status === "fulfilled" ? jfEpisodesR.value : null;
  const tvdbId = Number(jf?.ProviderIds?.Tvdb) || jfDetail?.tvdbId || null;

  // карта Jellyfin-эпизодов по S{n}E{n} → { id, played }
  const jfMap = new Map<string, { id: string; played: boolean }>();
  for (const s of jfDetail?.seasons ?? []) {
    for (const e of s.episodes) {
      if (e.episodeNumber != null) jfMap.set(`S${s.seasonNumber}E${e.episodeNumber}`, { id: e.id, played: e.played });
    }
  }

  const sonarr = tvdbId ? await arrFindByExternalId("series", tvdbId) : null;
  let seasons: DetailSeason[] = [];

  if (sonarr) {
    seasons = await buildSonarrSeasons(sonarr, jfMap);
  } else if (jfDetail) {
    // Fallback: только Jellyfin.
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
    title: String(sonarr?.title ?? jf?.Name ?? jfDetail?.name ?? "—"),
    year: sonarr?.year ?? jf?.ProductionYear ?? null,
    overview: sonarr?.overview ?? jf?.Overview ?? null,
    genres: sonarr?.genres ?? jf?.Genres ?? [],
    network: sonarr?.network ?? jf?.Studios?.[0]?.Name ?? null,
    status: sonarr?.status ?? jf?.Status ?? null,
    runtime: sonarr?.runtime ?? ticksToMin(jf?.RunTimeTicks),
    rating: sonarr?.ratings?.value ?? jf?.CommunityRating ?? null,
    posterRemote: sonarr ? arrPoster(sonarr.images) : null,
    tvdbId,
    inArr: Boolean(sonarr),
    monitored: Boolean(sonarr?.monitored),
    seasons,
  };
}

// Детальная страница фильма: Radarr (метаданные + файл/качество) merged с Jellyfin.
export async function getMoviePageDetail(jellyfinId: string): Promise<MoviePageDetail> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const jf = await jellyfinItem(jellyfinId);
  const tmdbId = Number(jf?.ProviderIds?.Tmdb) || null;
  const radarr = tmdbId ? await arrFindByExternalId("movie", tmdbId) : null;
  return {
    jellyfinId,
    title: String(radarr?.title ?? jf?.Name ?? "—"),
    year: radarr?.year ?? jf?.ProductionYear ?? null,
    overview: radarr?.overview ?? jf?.Overview ?? null,
    genres: radarr?.genres ?? jf?.Genres ?? [],
    studio: radarr?.studio ?? jf?.Studios?.[0]?.Name ?? null,
    status: radarr?.status ?? jf?.Status ?? null,
    runtime: radarr?.runtime ?? ticksToMin(jf?.RunTimeTicks),
    rating: radarr?.ratings?.value ?? radarr?.ratings?.tmdb?.value ?? jf?.CommunityRating ?? null,
    posterRemote: radarr ? arrPoster(radarr.images) : null,
    tmdbId,
    inArr: Boolean(radarr),
    monitored: Boolean(radarr?.monitored),
    hasFile: Boolean(radarr?.hasFile),
    quality: radarr?.movieFile?.quality?.quality?.name ?? null,
    size: radarr?.movieFile?.size ?? null,
  };
}

// Детальная страница сериала по внешнему tvdbId (discovery — тайтл может быть ещё НЕ
// в библиотеке). Если в Sonarr → реальные сезоны/эпизоды/файлы; иначе — скелет сезонов
// из lookup-записи. jellyfinId пустой: плеер для новых тайтлов не нужен (деградация).
export async function getSeriesDiscoverDetail(tvdbId: number): Promise<SeriesPageDetail> {
  if (!config.media.sonarr.configured) throw new Error("Sonarr не настроен");
  const sonarr = await arrFindByExternalId("series", tvdbId);
  const rec = sonarr ?? (await arrLookupRecordByExternalId("series", tvdbId));
  if (!rec) throw new Error(`series не найден (tvdb ${tvdbId})`);
  const seasons: DetailSeason[] = sonarr
    ? await buildSonarrSeasons(sonarr, new Map())
    : ((rec.seasons ?? []) as any[])
        .map((s) => ({
          seasonNumber: Number(s.seasonNumber ?? 0),
          episodes: [],
          fileCount: 0,
          totalCount: 0,
          monitored: Boolean(s.monitored),
        }))
        .sort((a, b) => a.seasonNumber - b.seasonNumber);
  return {
    jellyfinId: "",
    title: String(rec.title ?? "—"),
    year: rec.year ?? null,
    overview: rec.overview ?? null,
    genres: rec.genres ?? [],
    network: rec.network ?? null,
    status: rec.status ?? null,
    runtime: rec.runtime ?? null,
    rating: rec.ratings?.value ?? null,
    posterRemote: arrPoster(rec.images),
    tvdbId,
    inArr: Boolean(sonarr),
    monitored: Boolean(sonarr?.monitored),
    seasons,
  };
}

// Детальная страница фильма по внешнему tmdbId (discovery). Если в Radarr → статус
// файла; иначе — метаданные из lookup-записи (inArr:false, файла нет).
export async function getMovieDiscoverDetail(tmdbId: number): Promise<MoviePageDetail> {
  if (!config.media.radarr.configured) throw new Error("Radarr не настроен");
  const radarr = await arrFindByExternalId("movie", tmdbId);
  const rec = radarr ?? (await arrLookupRecordByExternalId("movie", tmdbId));
  if (!rec) throw new Error(`movie не найден (tmdb ${tmdbId})`);
  return {
    jellyfinId: "",
    title: String(rec.title ?? "—"),
    year: rec.year ?? null,
    overview: rec.overview ?? null,
    genres: rec.genres ?? [],
    studio: rec.studio ?? null,
    status: rec.status ?? null,
    runtime: rec.runtime ?? null,
    rating: radarr?.ratings?.value ?? radarr?.ratings?.tmdb?.value ?? rec.ratings?.value ?? null,
    posterRemote: arrPoster(rec.images),
    tmdbId,
    inArr: Boolean(radarr),
    monitored: Boolean(radarr?.monitored),
    hasFile: Boolean(radarr?.hasFile),
    quality: radarr?.movieFile?.quality?.quality?.name ?? null,
    size: radarr?.movieFile?.size ?? null,
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

// ── Sonarr / Radarr (одинаковый /api/v3/queue) ─────────────────────────
interface ArrQueueRecord {
  title?: string;
  size?: number;
  sizeleft?: number;
  status?: string;
  downloadId?: string;
  trackedDownloadState?: string;
  trackedDownloadStatus?: string;
  statusMessages?: { title?: string; messages?: string[] }[];
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
    // Раздача скачана, но импорт не прошёл (multi-season пак / мис-парс): Sonarr/Radarr
    // держит её в очереди с warning/error и statusMessages про импорт.
    const msgs = (r.statusMessages ?? []).flatMap((m) => m.messages ?? []);
    const blockedState = r.trackedDownloadState === "importPending" || r.trackedDownloadState === "importBlocked";
    const warnStatus = r.trackedDownloadStatus === "warning" || r.trackedDownloadStatus === "error";
    const importHint = msgs.some((m) => /import|grabbed release|season|episode/i.test(m));
    const importPending = blockedState || (warnStatus && importHint);
    const importMessage = importPending ? (msgs.find((m) => m.trim())?.trim().slice(0, 90) || undefined) : undefined;
    return {
      hash: r.downloadId ?? r.title ?? Math.random().toString(36),
      title: r.title ?? "—",
      source,
      progress,
      state: r.status ?? "—",
      size,
      downloadId: r.downloadId,
      importPending,
      importMessage,
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

// Добавить торрент в qBittorrent с опциями (paused/category/savePath). Базовый
// метод — qbAdd и пофайловый граб (qbApplySelection) идут через него.
async function qbAddRaw(
  urlOrMagnet: string,
  opts: { paused?: boolean; category?: string; savePath?: string } = {},
): Promise<void> {
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
  await assertQbAdded(res);
  cache = null;
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

// Объединённый поиск тайтла по фильмам и сериалам (для виджета discovery).
// Сериалы идут первыми, затем фильмы. Источники изолированы (allSettled).
export async function arrLookupAll(term: string): Promise<ArrLookupItem[]> {
  const [series, movies] = await Promise.allSettled([
    arrLookup("series", term),
    arrLookup("movie", term),
  ]);
  return [
    ...(series.status === "fulfilled" ? series.value : []),
    ...(movies.status === "fulfilled" ? movies.value : []),
  ];
}

// Полная raw-запись тайтла из *arr lookup по внешнему id (term=tmdb:|tvdb:).
// Несёт всё для POST (arrEnsureAdded) и для скелета discover-страницы (seasons/images/overview).
async function arrLookupRecordByExternalId(
  kind: "movie" | "series",
  id: number,
): Promise<(ArrLookupRecord & Record<string, any>) | null> {
  const cfg = arrCfg(kind);
  if (!cfg.configured || !id) return null;
  const path = kind === "movie" ? "movie" : "series";
  const idScheme = kind === "movie" ? "tmdb" : "tvdb";
  const res = await fetch(`${cfg.url}/api/v3/${path}/lookup?term=${idScheme}:${id}`, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as (ArrLookupRecord & Record<string, any>)[];
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

// Обеспечить присутствие тайтла в библиотеке *arr и вернуть внутренний id.
// Если тайтл уже добавлен — lookup по id вернёт found.id>0, отдаём его без POST.
// autoSearch=true (ручка «Добавить») сразу запускает поиск релиза; false («Выбрать
// раздачу») добавляет monitored без авто-поиска, чтобы появился internal id для
// интерактивного /release. Единый источник логики добавления (DRY с arrAdd).
async function arrEnsureAdded(
  kind: "movie" | "series",
  id: number,
  autoSearch: boolean,
): Promise<{ id: number; title: string; alreadyInLibrary: boolean }> {
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
  const found = await arrLookupRecordByExternalId(kind, id);
  if (!found) throw new Error(`${kind}: не найдено (id ${id})`);
  if (found.id && found.id > 0) {
    return { id: found.id, title: found.title ?? "—", alreadyInLibrary: true };
  }

  const body: Record<string, unknown> = {
    ...found,
    qualityProfileId: qp.id,
    rootFolderPath: root.path,
    monitored: true,
  };
  if (kind === "movie") {
    body.minimumAvailability = "released";
    body.addOptions = { searchForMovie: autoSearch };
  } else {
    body.addOptions = { searchForMissingEpisodes: autoSearch, monitor: "all" };
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
  const created = (await res.json()) as { id: number; title?: string };
  cache = null;
  return { id: created.id, title: created.title ?? found.title ?? "—", alreadyInLibrary: false };
}

// Добавить тайтл в библиотеку *arr и запустить поиск релиза (авто-граб).
export async function arrAdd(kind: "movie" | "series", id: number): Promise<{ title: string }> {
  const { title } = await arrEnsureAdded(kind, id, true);
  return { title };
}

// ── Интерактивный поиск/граб релизов (Sonarr/Radarr /api/v3/release) ────────
export interface ReleaseOption {
  guid: string;
  indexerId: number;
  title: string;
  quality: string; // напр. "WEBDL-1080p"
  languages: string[]; // напр. ["Russian"] — несёт инфо об озвучке для русских релизов
  size: number;
  seeders: number | null;
  indexer: string;
  protocol: string;
  rejected: boolean;
  rejections: string[];
}

// Кеш полных raw-записей релизов по guid — grab переотправляет полный объект
// (надёжнее, чем guid+indexerId, который ловит downloadAllowed:false вне кеша *arr).
const releaseCache = new Map<string, { record: Record<string, unknown>; kind: "movie" | "series"; at: number }>();
const RELEASE_TTL = 10 * 60_000;

function mapRelease(r: Record<string, unknown>): ReleaseOption {
  const q = r.quality as { quality?: { name?: string } } | undefined;
  const langs = Array.isArray(r.languages)
    ? (r.languages as { name?: string }[]).map((l) => String(l.name ?? "")).filter(Boolean)
    : [];
  return {
    guid: String(r.guid ?? ""),
    indexerId: Number(r.indexerId ?? 0),
    title: String(r.title ?? "—"),
    quality: String(q?.quality?.name ?? "—"),
    languages: langs,
    size: Number(r.size ?? 0),
    seeders: r.seeders != null ? Number(r.seeders) : null,
    indexer: String(r.indexer ?? "—"),
    protocol: String(r.protocol ?? "—"),
    rejected: Boolean(r.rejected),
    rejections: Array.isArray(r.rejections) ? (r.rejections as unknown[]).map(String) : [],
  };
}

// Интерактивный поиск релизов. movie → Radarr ?movieId; series → Sonarr ?seriesId&seasonNumber.
// externalId — tmdbId (movie) | tvdbId (series); тайтл при необходимости добавляется
// monitored без авто-поиска, чтобы получить internal id.
export async function arrReleaseSearch(
  kind: "movie" | "series",
  externalId: number,
  seasonNumber?: number,
): Promise<ReleaseOption[]> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) throw new Error(`${kind === "movie" ? "Radarr" : "Sonarr"} не настроен`);
  const internalId = (await arrEnsureAdded(kind, externalId, false)).id;
  const url = new URL(`${cfg.url}/api/v3/release`);
  if (kind === "movie") {
    url.searchParams.set("movieId", String(internalId));
  } else {
    url.searchParams.set("seriesId", String(internalId));
    if (seasonNumber != null) url.searchParams.set("seasonNumber", String(seasonNumber));
  }
  const res = await fetch(url, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${kind} release search ${res.status}`);
  const records = (await res.json()) as Record<string, unknown>[];
  const now = Date.now();
  for (const [g, v] of releaseCache) if (now - v.at > RELEASE_TTL) releaseCache.delete(g);
  const torrents = records.filter((r) => r.protocol === "torrent");
  for (const r of torrents) if (r.guid) releaseCache.set(String(r.guid), { record: r, kind, at: now });
  return torrents.map(mapRelease).sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
}

// Форс-граб выбранного релиза: POST полного объекта (из кеша) → *arr качает+импортирует.
export async function arrReleaseGrab(
  kind: "movie" | "series",
  guid: string,
  indexerId: number,
): Promise<void> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) throw new Error(`${kind === "movie" ? "Radarr" : "Sonarr"} не настроен`);
  const headers = { "X-Api-Key": cfg.apiKey!, "Content-Type": "application/json" };
  const cached = releaseCache.get(guid);
  const body: Record<string, unknown> = cached ? cached.record : { guid, indexerId };
  const res = await fetch(`${cfg.url}/api/v3/release`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  // *arr иногда отдаёт 500 «Failed to connect to qBittorrent», но торрент реально
  // добавлен — считаем 2xx и 5xx успехом (как выяснено при форс-грабе), бросаем на 4xx.
  if (res.status >= 400 && res.status < 500) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${kind} grab ${res.status}: ${txt.slice(0, 200)}`);
  }
  cache = null;
}

// ── Ручной импорт застрявших раздач (Sonarr/Radarr ManualImport) ───────
// Multi-season пак скачан, но авто-импорт отклонён («not found in the grabbed
// release» и т.п.). Manual Import импортирует выбранные файлы в обход реджекта —
// как кнопка «Import» в UI Sonarr/Radarr.
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
  folderName: string | null;
  size: number;
  quality: string;
  languages: string[];
  releaseGroup: string | null;
  seasonNumber: number | null; // series
  episodes: ManualImportEpisode[]; // series
  movieTitle: string | null; // movie
  rejections: string[];
}

// Кеш сырых записей manualimport по downloadId — execute переотправляет точные
// quality/languages объекты (та же логика, что и releaseCache).
const importCache = new Map<string, { records: Record<string, any>[]; kind: "movie" | "series"; at: number }>();
const IMPORT_TTL = 10 * 60_000;

function mapImportFile(r: Record<string, any>, id: number): ManualImportFile {
  const eps = Array.isArray(r.episodes) ? r.episodes : [];
  return {
    id,
    path: String(r.path ?? ""),
    relativePath: String(r.relativePath ?? r.name ?? ""),
    folderName: r.folderName ?? null,
    size: Number(r.size ?? 0),
    quality: String(r.quality?.quality?.name ?? "—"),
    languages: Array.isArray(r.languages) ? r.languages.map((l: any) => String(l.name ?? "")).filter(Boolean) : [],
    releaseGroup: r.releaseGroup ?? null,
    seasonNumber: r.seasonNumber ?? null,
    episodes: eps.map((e: any) => ({
      id: Number(e.id ?? 0),
      seasonNumber: Number(e.seasonNumber ?? r.seasonNumber ?? 0),
      episodeNumber: Number(e.episodeNumber ?? 0),
      title: String(e.title ?? "—"),
    })),
    movieTitle: r.movie?.title ?? null,
    rejections: Array.isArray(r.rejections) ? r.rejections.map((x: any) => String(x.reason ?? x)) : [],
  };
}

// Кандидаты для ручного импорта застрявшей раздачи (по downloadId = qB-хеш).
export async function manualImportCandidates(
  kind: "movie" | "series",
  downloadId: string,
): Promise<ManualImportFile[]> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) throw new Error(`${kind === "movie" ? "Radarr" : "Sonarr"} не настроен`);
  const url = new URL(`${cfg.url}/api/v3/manualimport`);
  url.searchParams.set("downloadId", downloadId);
  url.searchParams.set("filterExistingFiles", "true");
  const res = await fetch(url, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${kind} manualimport ${res.status}`);
  const records = (await res.json()) as Record<string, any>[];
  const now = Date.now();
  for (const [k, v] of importCache) if (now - v.at > IMPORT_TTL) importCache.delete(k);
  importCache.set(downloadId, { records, kind, at: now });
  return records.map((r, i) => mapImportFile(r, i));
}

// Авто-выбор файлов: по одному лучшему на серию (series) / на фильм (movie),
// дедуп копий (две S2 в паке). Используется MCP-дефолтом (UI зеркалит ту же логику).
export function autoSelectImportFileIds(files: ManualImportFile[], kind: "movie" | "series"): number[] {
  const usable = files.filter((f) => {
    // пропускаем дубли уже существующего лучшего качества
    if (f.rejections.some((m) => /not an upgrade|already imported/i.test(m))) return false;
    return kind === "series" ? f.episodes.length > 0 : Boolean(f.movieTitle);
  });
  const best = new Map<string, ManualImportFile>();
  for (const f of usable) {
    const keys =
      kind === "series"
        ? f.episodes.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`)
        : [`movie-${f.movieTitle}`];
    for (const key of keys) {
      const prev = best.get(key);
      if (!prev || f.rejections.length < prev.rejections.length ||
          (f.rejections.length === prev.rejections.length && f.size > prev.size)) {
        best.set(key, f);
      }
    }
  }
  return [...new Set([...best.values()].map((f) => f.id))];
}

// Импорт выбранных файлов: POST ManualImport-команды полными объектами из кеша.
export async function manualImportExecute(
  kind: "movie" | "series",
  downloadId: string,
  fileIds: number[],
  importMode: "copy" | "move" = "copy",
): Promise<number> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) throw new Error(`${kind === "movie" ? "Radarr" : "Sonarr"} не настроен`);
  let cached = importCache.get(downloadId);
  if (!cached) {
    await manualImportCandidates(kind, downloadId);
    cached = importCache.get(downloadId);
  }
  if (!cached) throw new Error("Нет кандидатов для импорта");
  const wanted = new Set(fileIds);
  const files = cached.records
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => wanted.has(i))
    .map(({ r }) =>
      kind === "series"
        ? {
            path: r.path,
            folderName: r.folderName,
            seriesId: r.series?.id,
            episodeIds: (r.episodes ?? []).map((e: any) => e.id),
            quality: r.quality,
            languages: r.languages,
            releaseGroup: r.releaseGroup,
          }
        : {
            path: r.path,
            folderName: r.folderName,
            movieId: r.movie?.id,
            quality: r.quality,
            languages: r.languages,
            releaseGroup: r.releaseGroup,
          },
    );
  if (files.length === 0) throw new Error("Не выбрано ни одного файла");
  const headers = { "X-Api-Key": cfg.apiKey!, "Content-Type": "application/json" };
  const res = await fetch(`${cfg.url}/api/v3/command`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "ManualImport", importMode, files }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status >= 400 && res.status < 500) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${kind} import ${res.status}: ${txt.slice(0, 200)}`);
  }
  cache = null;
  return files.length;
}

// ── Подборки (discover) из import-list'ов Radarr/Sonarr ─────────────────────
// Radarr GET /api/v3/importlist/movie и Sonarr /api/v3/importlist/series отдают
// тайтлы из настроенных import-list'ов с флагами isExisting/isExcluded. Ключ TMDB
// не нужен — discover живёт внутри *arr. Предусловие: включён хотя бы один список.

export interface Recommendation {
  kind: "movie" | "series";
  id: number; // tmdbId (movie) | tvdbId (series) — то, что принимает arrAdd
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
}

interface ArrImportListRecord {
  title?: string;
  year?: number;
  tmdbId?: number;
  tvdbId?: number;
  overview?: string;
  images?: ArrImage[];
  isExisting?: boolean;
  isExcluded?: boolean;
}

async function arrImportList(kind: "movie" | "series"): Promise<Recommendation[]> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) return [];
  const path = kind === "movie" ? "movie" : "series";
  const res = await fetch(`${cfg.url}/api/v3/importlist/${path}`, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${kind} importlist ${res.status}`);
  const items = (await res.json()) as ArrImportListRecord[];
  return items
    .filter((it) => !it.isExisting && !it.isExcluded)
    .map((it) => ({
      kind,
      id: (kind === "movie" ? it.tmdbId : it.tvdbId) ?? 0,
      title: it.title ?? "—",
      year: it.year ?? null,
      overview: it.overview ?? "",
      poster: arrPoster(it.images),
    }))
    .filter((r) => r.id > 0);
}

// Подборки фильмов+сериалов, которых ещё нет в библиотеке.
export async function getRecommendations(): Promise<Recommendation[]> {
  if (!config.media.radarr.configured && !config.media.sonarr.configured) return [];
  const [movies, series] = await Promise.allSettled([
    arrImportList("movie"),
    arrImportList("series"),
  ]);
  const all = [
    ...(movies.status === "fulfilled" ? movies.value : []),
    ...(series.status === "fulfilled" ? series.value : []),
  ];
  const seen = new Set<string>();
  const deduped = all.filter((r) => {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.slice(0, 40);
}

// ── Расписание / monitor / поиск сезона (удобный пайплайн сериалов) ─────────
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

// Расписание выходящих эпизодов (Sonarr) + релизов фильмов (Radarr) на N дней вперёд/назад.
export async function getCalendar(days = 14): Promise<CalendarItem[]> {
  const start = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const end = new Date(Date.now() + days * 86_400_000).toISOString();

  const sonarrCal = async (): Promise<CalendarItem[]> => {
    const cfg = config.media.sonarr;
    if (!cfg.configured) return [];
    const url = new URL(`${cfg.url}/api/v3/calendar`);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    url.searchParams.set("includeSeries", "true");
    url.searchParams.set("includeEpisodeFile", "true");
    const res = await fetch(url, { headers: { "X-Api-Key": cfg.apiKey! }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`sonarr calendar ${res.status}`);
    const recs = (await res.json()) as Record<string, any>[];
    return recs.map((r) => ({
      kind: "series" as const,
      title: String(r.series?.title ?? "—"),
      externalId: Number(r.series?.tvdbId) || null,
      seasonNumber: r.seasonNumber ?? null,
      episodeNumber: r.episodeNumber ?? null,
      episodeTitle: r.title ?? null,
      airDate: r.airDateUtc ?? null,
      hasFile: Boolean(r.hasFile),
      monitored: Boolean(r.monitored),
    }));
  };

  const radarrCal = async (): Promise<CalendarItem[]> => {
    const cfg = config.media.radarr;
    if (!cfg.configured) return [];
    const url = new URL(`${cfg.url}/api/v3/calendar`);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    const res = await fetch(url, { headers: { "X-Api-Key": cfg.apiKey! }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`radarr calendar ${res.status}`);
    const recs = (await res.json()) as Record<string, any>[];
    return recs.map((r) => ({
      kind: "movie" as const,
      title: String(r.title ?? "—"),
      externalId: Number(r.tmdbId) || null,
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      airDate: r.digitalRelease ?? r.physicalRelease ?? r.inCinemas ?? null,
      hasFile: Boolean(r.hasFile),
      monitored: Boolean(r.monitored),
    }));
  };

  const [s, m] = await Promise.allSettled([sonarrCal(), radarrCal()]);
  const all = [
    ...(s.status === "fulfilled" ? s.value : []),
    ...(m.status === "fulfilled" ? m.value : []),
  ];
  return all
    .filter((x) => x.airDate)
    .sort((a, b) => new Date(a.airDate!).getTime() - new Date(b.airDate!).getTime());
}

// Запуск поиска: весь сезон (Sonarr SeasonSearch) / недостающие (MissingEpisodeSearch) /
// фильм (Radarr MoviesSearch). id = внешний (tvdbId/tmdbId) → резолвим внутренний.
export async function arrTriggerSearch(
  kind: "movie" | "series",
  externalId: number,
  seasonNumber?: number,
): Promise<void> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) throw new Error(`${kind === "movie" ? "Radarr" : "Sonarr"} не настроен`);
  const rec = await arrFindByExternalId(kind, externalId);
  if (!rec) throw new Error("Тайтл не найден в библиотеке *arr");
  const headers = { "X-Api-Key": cfg.apiKey!, "Content-Type": "application/json" };
  const body: Record<string, unknown> =
    kind === "movie"
      ? { name: "MoviesSearch", movieIds: [rec.id] }
      : seasonNumber != null
        ? { name: "SeasonSearch", seriesId: rec.id, seasonNumber }
        : { name: "MissingEpisodeSearch", seriesId: rec.id };
  const res = await fetch(`${cfg.url}/api/v3/command`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok && res.status !== 201) throw new Error(`${kind} search command ${res.status}`);
  cache = null;
}

// Monitor toggle: сезон сериала / весь сериал / фильм. GET → patch → PUT (не затираем поля).
export async function arrSetMonitored(
  kind: "movie" | "series",
  externalId: number,
  monitored: boolean,
  seasonNumber?: number,
): Promise<void> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) throw new Error(`${kind === "movie" ? "Radarr" : "Sonarr"} не настроен`);
  const rec = await arrFindByExternalId(kind, externalId);
  if (!rec) throw new Error("Тайтл не найден в библиотеке *arr");
  const headers = { "X-Api-Key": cfg.apiKey!, "Content-Type": "application/json" };
  const path = kind === "movie" ? "movie" : "series";

  if (kind === "series" && seasonNumber != null && Array.isArray(rec.seasons)) {
    rec.seasons = rec.seasons.map((s: any) =>
      Number(s.seasonNumber) === seasonNumber ? { ...s, monitored } : s,
    );
  } else {
    rec.monitored = monitored;
  }
  const res = await fetch(`${cfg.url}/api/v3/${path}/${rec.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(rec),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${kind} monitor ${res.status}`);
  cache = null;
}

// ── Продолжить просмотр + единый поиск (discovery) ──────────────────────────
export interface ResumeItem {
  id: string;
  title: string;
  kind: "movie" | "episode";
  positionPct: number;
  year: number | null;
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
  url.searchParams.set("Fields", "SeriesName,UserData,RunTimeTicks,ProductionYear");
  const res = await fetch(url, { headers: jfHeaders(), signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Jellyfin Resume ${res.status}`);
  const body = (await res.json()) as {
    Items?: {
      Id: string; Name?: string; SeriesName?: string; Type?: string;
      ProductionYear?: number; RunTimeTicks?: number;
      UserData?: { PlaybackPositionTicks?: number };
    }[];
  };
  return (body.Items ?? []).map((it) => {
    const runtime = it.RunTimeTicks ?? 0;
    const pos = it.UserData?.PlaybackPositionTicks ?? 0;
    return {
      id: it.Id,
      title: it.SeriesName ? `${it.SeriesName} — ${it.Name ?? ""}` : it.Name ?? "—",
      kind: it.Type === "Movie" ? "movie" as const : "episode" as const,
      positionPct: runtime > 0 ? Math.round((pos / runtime) * 100) : 0,
      year: it.ProductionYear ?? null,
    };
  });
}

export interface UnifiedSearch {
  inLibrary: LibraryItem[];
  discover: ArrLookupItem[];
  releases: SearchResult[];
}

// Единый поиск: библиотека Jellyfin (по имени) + lookup Radarr/Sonarr (discover) +
// Prowlarr (релизы для мгновенного стрима). Каждый источник изолирован.
export async function unifiedSearch(q: string): Promise<UnifiedSearch> {
  const term = q.trim().toLowerCase();
  if (!term) return { inLibrary: [], discover: [], releases: [] };
  const [lib, movies, series, releases] = await Promise.allSettled([
    getLibrary(),
    arrLookup("movie", q),
    arrLookup("series", q),
    prowlarrSearch(q),
  ]);
  const inLibrary = (lib.status === "fulfilled" ? lib.value : [])
    .filter((it) => it.name.toLowerCase().includes(term))
    .slice(0, 8);
  const discover = [
    ...(movies.status === "fulfilled" ? movies.value : []),
    ...(series.status === "fulfilled" ? series.value : []),
  ].slice(0, 8);
  const rel = (releases.status === "fulfilled" ? releases.value : []).slice(0, 8);
  return { inLibrary, discover, releases: rel };
}

// ── Сводка ────────────────────────────────────────────────────────────────
export async function getMedia(): Promise<MediaData> {
  if (!config.media.configured) {
    return { configured: false, torrserver: false, tmdb: false, nowPlaying: [], downloads: [] };
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
