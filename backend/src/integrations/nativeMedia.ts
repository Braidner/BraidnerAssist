import path from "node:path";
import { prisma } from "../db/client.js";
import { config } from "../config.js";
import { jackettSearchMany } from "./jackett.js";
import {
  jellyfinRefresh,
  getMediaTitleDetail,
  qbAddRaw,
  qbittorrentDownloads,
  type DownloadItem,
  type MoviePageDetail,
  type SearchResult,
  type SeriesPageDetail,
  type SeriesTitleIdType,
} from "./media.js";
import {
  tmdbDetails,
  tmdbFindByTvdb,
  tmdbSearch,
  tmdbSeason,
  tmdbTvSeasons,
  tmdbTvToTvdb,
  type TmdbItem,
} from "./tmdb.js";

type MediaKind = "movie" | "series";

export interface MediaLookupItem {
  kind: MediaKind;
  id: number;
  tmdbId: number;
  tvdbId: number | null;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  added: boolean;
  monitored: boolean;
}

export interface TorrentRailItem {
  kind: MediaKind;
  tmdbId: number;
  tvdbId: number | null;
  jellyfinId: string | null;
  title: string;
  year: number | null;
  poster: string | null;
  backdrop: string | null;
  infohash: string;
  releaseTitle: string;
  indexer: string | null;
  size: number | null;
  seeders: number | null;
  savePath: string | null;
  seasonNumber: number | null;
  progress: number;
  state: string;
  dlspeed: number;
  eta: number | null;
  status: "downloading" | "awaiting_jellyfin" | "in_library";
}

export interface PendingMediaTitle {
  kind: MediaKind;
  tmdbId: number;
  tvdbId: number | null;
  title: string;
  year: number | null;
  poster: string | null;
  backdrop: string | null;
  createdAt: string;
  updatedAt: string;
}

const RELEASE_CACHE_TTL = 10 * 60_000;
const LIBRARY_CATEGORY = "mc-library";
const releaseCache = new Map<string, { at: number; item: SearchResult & { type: MediaKind; tmdbId: number; tvdbId: number | null; titleHint: string; seasonNumber?: number } }>();

function cacheKey(type: MediaKind, guid: string, indexerId: number | string): string {
  return `${type}:${indexerId}:${guid}`;
}

function keepCacheFresh(): void {
  const now = Date.now();
  for (const [key, value] of releaseCache) {
    if (now - value.at > RELEASE_CACHE_TTL) releaseCache.delete(key);
  }
}

export function librarySavePath(kind: MediaKind): string | undefined {
  const root = config.mediaFs.qbittorrentRoot ? path.resolve(config.mediaFs.qbittorrentRoot) : null;
  if (!root) return undefined;
  return path.join(root, kind === "series" ? config.mediaFs.tv : config.mediaFs.movies);
}

function safeFolderName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 140) || "Untitled";
}

function canonicalFolderName(
  kind: MediaKind,
  title: { title: string; year: number | null; tmdbId: number; tvdbId: number | null },
  detail: TmdbItem | null,
): string {
  const name = safeFolderName(detail?.originalTitle ?? title.title);
  const year = title.year ? ` (${title.year})` : "";
  const ids = [`[tmdbid-${title.tmdbId}]`];
  if (kind === "series" && title.tvdbId) ids.push(`[tvdbid-${title.tvdbId}]`);
  return `${name}${year} ${ids.join(" ")}`;
}

export function titleSavePath(kind: MediaKind, title: { title: string; year: number | null; tmdbId: number; tvdbId: number | null }, detail: TmdbItem | null): string | undefined {
  const root = librarySavePath(kind);
  if (!root) return undefined;
  return path.join(root, canonicalFolderName(kind, title, detail));
}

function releaseQueries(detail: TmdbItem | null, title: string, seasonNumber?: number): string[] {
  const titles = [title, detail?.originalTitle]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const unique = [...new Set(titles.map((v) => v.toLowerCase()))]
    .map((key) => titles.find((v) => v.toLowerCase() === key)!)
    .filter(Boolean);
  const season = seasonNumber != null ? ` S${String(seasonNumber).padStart(2, "0")}` : "";
  return unique.flatMap((titleValue) => [
    `${titleValue}${season}`,
    ...(detail?.year ? [`${titleValue} ${detail.year}${season}`] : []),
  ]);
}

async function resolveTmdbId(kind: MediaKind, id: number): Promise<{ tmdbId: number; tvdbId: number | null }> {
  if (kind === "movie") return { tmdbId: id, tvdbId: null };
  const detailByTmdb = await tmdbDetails("series", id).catch(() => null);
  if (detailByTmdb) {
    return { tmdbId: id, tvdbId: await tmdbTvToTvdb(id).catch(() => null) };
  }
  const tmdbId = await tmdbFindByTvdb(id).catch(() => null);
  if (!tmdbId) throw new Error("series not found in TMDB");
  return { tmdbId, tvdbId: id };
}

async function ensureTitle(kind: MediaKind, id: number) {
  const { tmdbId, tvdbId } = await resolveTmdbId(kind, id);
  const detail = await tmdbDetails(kind, tmdbId);
  if (!detail) throw new Error("TMDB title not found");
  const resolvedTvdb = kind === "series" ? tvdbId ?? await tmdbTvToTvdb(tmdbId).catch(() => null) : null;
  return prisma.mediaTitle.upsert({
    where: { kind_tmdbId: { kind, tmdbId } },
    create: {
      kind,
      tmdbId,
      tvdbId: resolvedTvdb,
      title: detail.title,
      year: detail.year,
      poster: detail.poster,
      backdrop: detail.backdrop,
      overview: detail.overview,
    },
    update: {
      tvdbId: resolvedTvdb,
      title: detail.title,
      year: detail.year,
      poster: detail.poster,
      backdrop: detail.backdrop,
      overview: detail.overview,
    },
  });
}

async function lookupItem(item: TmdbItem): Promise<MediaLookupItem> {
  const tvdbId = item.kind === "series" ? await tmdbTvToTvdb(item.tmdbId).catch(() => null) : null;
  const title = await prisma.mediaTitle.findUnique({ where: { kind_tmdbId: { kind: item.kind, tmdbId: item.tmdbId } } });
  return {
    kind: item.kind,
    id: item.tmdbId,
    tmdbId: item.tmdbId,
    tvdbId,
    title: item.title,
    year: item.year,
    overview: item.overview,
    poster: item.poster,
    backdrop: item.backdrop,
    added: Boolean(title?.jellyfinId),
    monitored: false,
  };
}

export async function nativeLookup(kind: MediaKind, query: string): Promise<MediaLookupItem[]> {
  const items = (await tmdbSearch(query)).filter((item) => item.kind === kind);
  return Promise.all(items.slice(0, 12).map(lookupItem));
}

export async function nativeLookupAll(query: string): Promise<MediaLookupItem[]> {
  const items = await tmdbSearch(query);
  return Promise.all(items.slice(0, 16).map(lookupItem));
}

export async function nativeAdd(kind: MediaKind, id: number): Promise<{ title: string; titleId: string; alreadyInLibrary: boolean }> {
  const title = await ensureTitle(kind, id);
  return { title: title.title, titleId: title.id, alreadyInLibrary: Boolean(title.jellyfinId) };
}

export async function nativeReleaseSearch(kind: MediaKind, id: number, seasonNumber?: number): Promise<SearchResult[]> {
  keepCacheFresh();
  const title = await ensureTitle(kind, id);
  const detail = await tmdbDetails(kind, title.tmdbId).catch(() => null);
  const queries = releaseQueries(detail, title.title, kind === "series" ? seasonNumber : undefined);
  const releases = await jackettSearchMany(queries, { kind });
  for (const release of releases) {
    const item = {
      ...release,
      type: kind,
      tmdbId: title.tmdbId,
      tvdbId: title.tvdbId,
      titleHint: title.title,
      seasonNumber: kind === "series" ? seasonNumber : undefined,
    };
    releaseCache.set(cacheKey(kind, release.guid, release.indexerId ?? release.trackerId ?? release.indexer), { at: Date.now(), item });
    releaseCache.set(cacheKey(kind, release.guid, release.indexer), { at: Date.now(), item });
  }
  return releases;
}

export async function nativeGrabRelease(kind: MediaKind, guid: string, indexerId: number | string): Promise<{ ok: true; infohash: string; added: boolean }> {
  keepCacheFresh();
  const cached = releaseCache.get(cacheKey(kind, guid, indexerId)) ?? [...releaseCache.values()].find((value) => value.item.type === kind && value.item.guid === guid);
  if (!cached?.item.url) throw new Error("Release not in cache; run search_releases first");
  const item = cached.item;
  const source = String(item.url);
  const title = await ensureTitle(kind, item.tmdbId);
  const detail = await tmdbDetails(kind, title.tmdbId).catch(() => null);
  const savePath = titleSavePath(kind, title, detail);
  const addedIds = await qbAddRaw(source, { category: LIBRARY_CATEGORY, savePath });
  const infohash = (addedIds[0] ?? item.infoHash ?? "").toLowerCase();
  if (!infohash) throw new Error("qBittorrent добавил торрент, но не вернул hash");
  await prisma.mediaTorrent.upsert({
    where: { infohash },
    create: {
      titleId: title.id,
      infohash,
      releaseTitle: item.title,
      releaseUrl: source,
      guid: item.guid,
      indexer: item.trackerName ?? item.indexer,
      size: item.size,
      seeders: item.seeders,
      savePath: savePath ?? null,
      category: LIBRARY_CATEGORY,
      seasonNumber: item.seasonNumber ?? null,
    },
    update: {
      titleId: title.id,
      releaseTitle: item.title,
      releaseUrl: source,
      guid: item.guid,
      indexer: item.trackerName ?? item.indexer,
      size: item.size,
      seeders: item.seeders,
      savePath: savePath ?? null,
      category: LIBRARY_CATEGORY,
      seasonNumber: item.seasonNumber ?? null,
    },
  });
  await jellyfinRefresh().catch(() => {});
  return { ok: true, infohash, added: true };
}

export async function linkMediaTitlesToJellyfin(): Promise<void> {
  if (!config.media.jellyfin.configured) return;
  const { getLibrary } = await import("./media.js");
  const library = await getLibrary().catch(() => []);
  const byTmdb = new Map<string, string>();
  const byTvdb = new Map<string, string>();
  for (const item of library) {
    const kind: MediaKind = item.type === "Series" ? "series" : "movie";
    if (item.tmdbId) byTmdb.set(`${kind}:${item.tmdbId}`, item.id);
    if (kind === "series" && item.tvdbId) byTvdb.set(`series:${item.tvdbId}`, item.id);
  }
  const titles = await prisma.mediaTitle.findMany({ where: { jellyfinId: null } });
  await Promise.all(titles.map((title) => {
    const jellyfinId = byTmdb.get(`${title.kind}:${title.tmdbId}`) ?? (title.kind === "series" && title.tvdbId ? byTvdb.get(`series:${title.tvdbId}`) : null);
    if (!jellyfinId) return Promise.resolve();
    return prisma.mediaTitle.update({ where: { id: title.id }, data: { jellyfinId } });
  }));
}

export async function getTorrentRail(): Promise<TorrentRailItem[]> {
  await linkMediaTitlesToJellyfin().catch(() => {});
  const downloads = await qbittorrentDownloads().catch(() => []);
  const byHash = new Map(downloads.map((download) => [download.hash.toLowerCase(), download]));
  const rows = await prisma.mediaTorrent.findMany({
    include: { title: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const visible: TorrentRailItem[] = [];
  for (const row of rows) {
    const download = byHash.get(row.infohash.toLowerCase());
    const progress = download?.progress ?? Math.round(row.progress * 100);
    const completed = progress >= 100;
    const linked = Boolean(row.title.jellyfinId);
    await prisma.mediaTorrent.update({
      where: { id: row.id },
      data: {
        progress: Math.max(0, Math.min(1, progress / 100)),
        state: download?.state ?? row.state,
        lastSeenAt: download ? new Date() : row.lastSeenAt,
        completedAt: completed && !row.completedAt ? new Date() : row.completedAt,
        seeders: download?.seeds ?? row.seeders,
        size: download?.size ?? row.size,
        savePath: download?.savePath ?? row.savePath,
      },
    }).catch(() => {});
    if (completed && linked) continue;
    visible.push({
      kind: row.title.kind === "series" ? "series" : "movie",
      tmdbId: row.title.tmdbId,
      tvdbId: row.title.tvdbId,
      jellyfinId: row.title.jellyfinId,
      title: row.title.title,
      year: row.title.year,
      poster: row.title.poster,
      backdrop: row.title.backdrop,
      infohash: row.infohash,
      releaseTitle: row.releaseTitle,
      indexer: row.indexer,
      size: download?.size ?? row.size ?? null,
      seeders: download?.seeds ?? row.seeders ?? null,
      savePath: download?.savePath ?? row.savePath,
      seasonNumber: row.seasonNumber,
      progress,
      state: download?.state ?? row.state ?? "queued",
      dlspeed: download?.dlspeed ?? 0,
      eta: download?.eta ?? null,
      status: completed ? "awaiting_jellyfin" : "downloading",
    });
  }
  return visible.slice(0, 24);
}

export async function getPendingMediaTitles(): Promise<PendingMediaTitle[]> {
  await linkMediaTitlesToJellyfin().catch(() => {});
  const titles = await prisma.mediaTitle.findMany({
    where: {
      jellyfinId: null,
      torrents: { none: {} },
    },
    orderBy: { updatedAt: "desc" },
    take: 24,
  });
  return titles.map((title) => ({
    kind: title.kind === "series" ? "series" : "movie",
    tmdbId: title.tmdbId,
    tvdbId: title.tvdbId,
    title: title.title,
    year: title.year,
    poster: title.poster,
    backdrop: title.backdrop,
    createdAt: title.createdAt.toISOString(),
    updatedAt: title.updatedAt.toISOString(),
  }));
}

export async function getTitleTorrents(kind: MediaKind, tmdbId: number): Promise<TorrentRailItem[]> {
  await linkMediaTitlesToJellyfin().catch(() => {});
  const downloads = await qbittorrentDownloads().catch(() => []);
  const byHash = new Map(downloads.map((download) => [download.hash.toLowerCase(), download]));
  const title = await prisma.mediaTitle.findUnique({
    where: { kind_tmdbId: { kind, tmdbId } },
    include: {
      torrents: {
        orderBy: { updatedAt: "desc" },
        take: 24,
      },
    },
  });
  if (!title) return [];
  const rows = title.torrents;
  const items: TorrentRailItem[] = [];
  for (const row of rows) {
    const download = byHash.get(row.infohash.toLowerCase());
    const progress = download?.progress ?? Math.round(row.progress * 100);
    const completed = progress >= 100;
    await prisma.mediaTorrent.update({
      where: { id: row.id },
      data: {
        progress: Math.max(0, Math.min(1, progress / 100)),
        state: download?.state ?? row.state,
        lastSeenAt: download ? new Date() : row.lastSeenAt,
        completedAt: completed && !row.completedAt ? new Date() : row.completedAt,
        seeders: download?.seeds ?? row.seeders,
        size: download?.size ?? row.size,
        savePath: download?.savePath ?? row.savePath,
      },
    }).catch(() => {});
    items.push({
      kind: title.kind === "series" ? "series" : "movie",
      tmdbId: title.tmdbId,
      tvdbId: title.tvdbId,
      jellyfinId: title.jellyfinId,
      title: title.title,
      year: title.year,
      poster: title.poster,
      backdrop: title.backdrop,
      infohash: row.infohash,
      releaseTitle: row.releaseTitle,
      indexer: row.indexer,
      size: download?.size ?? row.size ?? null,
      seeders: download?.seeds ?? row.seeders ?? null,
      savePath: download?.savePath ?? row.savePath,
      seasonNumber: row.seasonNumber,
      progress,
      state: download?.state ?? row.state ?? "queued",
      dlspeed: download?.dlspeed ?? 0,
      eta: download?.eta ?? null,
      status: title.jellyfinId ? "in_library" : completed ? "awaiting_jellyfin" : "downloading",
    });
  }
  return items;
}

export async function nativeSeriesDiscoverDetail(
  id: number,
  idType: SeriesTitleIdType = "tvdb",
): Promise<SeriesPageDetail> {
  return await getMediaTitleDetail("series", id, { idType }) as SeriesPageDetail;
}

export async function nativeMovieDiscoverDetail(tmdbId: number): Promise<MoviePageDetail> {
  return await getMediaTitleDetail("movie", tmdbId) as MoviePageDetail;
}

export async function registerRawTorrent(urlOrMagnet: string, kind?: MediaKind): Promise<void> {
  await qbAddRaw(urlOrMagnet, {
    category: kind ? LIBRARY_CATEGORY : undefined,
    savePath: kind ? librarySavePath(kind) : undefined,
  });
}

export function isLibraryCategory(download: DownloadItem): boolean {
  return download.category === LIBRARY_CATEGORY;
}
