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
  type MediaUserContext,
  type MoviePageDetail,
  type ReleaseMatch,
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
import { parseReleaseTitle } from "./releaseParse.js";
import { listMediaPreferences } from "./mediaPreferences.js";

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

export interface MediaTitleStatus {
  kind: MediaKind;
  tmdbId: number;
  title: string;
  status: "watchlist" | "registered" | "release_selected" | "downloading" | "awaiting_jellyfin" | "in_library" | "watched";
  label: string;
  progress: number | null;
  jellyfinId: string | null;
  updatedAt: Date | string | null;
}

const RELEASE_CACHE_TTL = 10 * 60_000;
const LIBRARY_CATEGORY = "mc-library";
export type CachedRelease = SearchResult & {
  type: MediaKind;
  tmdbId: number;
  tvdbId: number | null;
  titleHint: string;
  seasonNumber?: number;
};

const releaseCache = new Map<string, { at: number; item: CachedRelease }>();

export function releaseCacheKey(type: MediaKind, tmdbId: number, guid: string, indexerId: number | string): string {
  return `${type}:${tmdbId}:${indexerId}:${guid}`;
}

export function cacheReleaseForTitle(item: CachedRelease): void {
  const at = Date.now();
  releaseCache.set(releaseCacheKey(item.type, item.tmdbId, item.guid, item.indexerId ?? item.trackerId ?? item.indexer), { at, item });
  releaseCache.set(releaseCacheKey(item.type, item.tmdbId, item.guid, item.indexer), { at, item });
}

export function cachedReleaseForTitle(
  type: MediaKind,
  tmdbId: number,
  guid: string,
  indexerId: number | string,
): CachedRelease | null {
  return releaseCache.get(releaseCacheKey(type, tmdbId, guid, indexerId))?.item ?? null;
}

export function clearReleaseCacheForTest(): void {
  releaseCache.clear();
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

function releaseQueries(detail: TmdbItem | null, title: string, seasonNumber?: number, filter?: string): string[] {
  const titles = [title, detail?.originalTitle]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const unique = [...new Set(titles.map((v) => v.toLowerCase()))]
    .map((key) => titles.find((v) => v.toLowerCase() === key)!)
    .filter(Boolean);
  const season = seasonNumber != null ? ` S${String(seasonNumber).padStart(2, "0")}` : "";
  const suffix = String(filter ?? "").trim();
  return unique.flatMap((titleValue) => [
    `${titleValue}${season}`,
    ...(detail?.year ? [`${titleValue} ${detail.year}${season}`] : []),
  ]).map((query) => [query, suffix].filter(Boolean).join(" "));
}

function releaseYear(item: SearchResult): number | null {
  const text = [
    item.details?.title,
    item.title,
  ].filter(Boolean).join(" ");
  return parseReleaseTitle(text).declaredYears[0] ?? null;
}

async function allowedReleaseYears(kind: MediaKind, title: { year: number | null; tmdbId: number }, seasonNumber?: number): Promise<number[]> {
  const years = new Set<number>();
  if (title.year) years.add(title.year);
  if (kind === "series" && seasonNumber != null) {
    const episodes = await tmdbSeason(title.tmdbId, seasonNumber).catch(() => []);
    for (const episode of episodes) {
      const year = episode.airDate?.slice(0, 4);
      const n = year ? Number(year) : NaN;
      if (Number.isFinite(n)) years.add(n);
    }
  }
  return [...years].sort((a, b) => a - b);
}

function releaseTextForMatch(item: SearchResult): string {
  return [item.details?.title, item.title].filter(Boolean).join(" ");
}

export function buildReleaseMatch(input: {
  kind: MediaKind;
  title: { year: number | null };
  item: SearchResult;
  seasonNumber?: number;
  allowedYears: number[];
}): ReleaseMatch {
  const parsed = parseReleaseTitle(releaseTextForMatch(input.item));
  const declaredYears = parsed.declaredYears;
  const targetYear = input.title.year;
  const yearStatus: ReleaseMatch["yearStatus"] = input.allowedYears.length === 0
    ? "unknown"
    : declaredYears.length === 0
      ? "unknown"
      : declaredYears.some((year) => input.allowedYears.includes(year))
        ? "match"
        : "mismatch";
  const seasonStatus: ReleaseMatch["seasonStatus"] = input.kind !== "series" || input.seasonNumber == null
    ? "not_applicable"
    : parsed.season == null
      ? "unknown"
      : parsed.season === input.seasonNumber
        ? "match"
        : "mismatch";
  const warnings = [
    ...(yearStatus === "mismatch" ? [`год не совпадает: ${declaredYears.join(", ")} ≠ ${input.allowedYears.join("/")}`] : []),
    ...(seasonStatus === "mismatch" ? [`не тот сезон: S${String(parsed.season).padStart(2, "0")}`] : []),
  ];
  const reasons = [
    ...(yearStatus === "match" ? [`год ${declaredYears.find((year) => input.allowedYears.includes(year))}`] : []),
    ...(seasonStatus === "match" ? [`S${String(input.seasonNumber).padStart(2, "0")}`] : []),
  ];
  const block = yearStatus === "mismatch" || seasonStatus === "mismatch";
  const confidence: ReleaseMatch["confidence"] = block
    ? "low"
    : yearStatus === "match" && (seasonStatus === "match" || seasonStatus === "not_applicable")
      ? "high"
      : "medium";
  return {
    targetYear,
    allowedYears: input.allowedYears,
    declaredYears,
    yearStatus,
    seasonStatus,
    confidence,
    block,
    reasons,
    warnings,
  };
}

export function applyReleaseMatch(item: SearchResult, match: ReleaseMatch): SearchResult {
  const scoreDelta =
    (match.yearStatus === "match" ? 18 : match.yearStatus === "mismatch" ? -180 : 0) +
    (match.seasonStatus === "match" ? 16 : match.seasonStatus === "mismatch" ? -120 : 0);
  return {
    ...item,
    match,
    score: (item.score ?? 0) + scoreDelta,
    scoreReasons: [...(item.scoreReasons ?? []), ...match.reasons],
    warnings: [...(item.warnings ?? []), ...match.warnings],
    rejected: Boolean((item as any).rejected) || match.block,
    rejections: [...((item as any).rejections ?? []), ...match.warnings],
  } as SearchResult;
}

export function assertMovieReleaseMatchesTitle(
  kind: MediaKind,
  title: { title: string; year: number | null },
  item: SearchResult,
): void {
  if (kind !== "movie" || !title.year) return;
  const year = releaseYear(item);
  if (!year || year === title.year) return;
  throw new Error(`Релиз похож на ${year}, а выбранный фильм — ${title.year}. Обнови поиск на странице нужного фильма.`);
}

export function assertReleaseMatchAllowsGrab(item: SearchResult): void {
  if (item.match?.yearStatus === "mismatch") {
    throw new Error(`Релиз похож на ${item.match.declaredYears.join(", ")}, а выбранный тайтл — ${item.match.allowedYears.join("/")}. Обнови поиск на странице нужного тайтла.`);
  }
  if (item.match?.seasonStatus === "mismatch") {
    throw new Error("Релиз относится к другому сезону. Обнови поиск на странице нужного сезона.");
  }
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

export async function nativeReleaseSearch(
  kind: MediaKind,
  id: number,
  seasonNumber?: number,
  opts: { query?: string; limit?: number } = {},
): Promise<SearchResult[]> {
  keepCacheFresh();
  const title = await ensureTitle(kind, id);
  const detail = await tmdbDetails(kind, title.tmdbId).catch(() => null);
  const queries = releaseQueries(detail, title.title, kind === "series" ? seasonNumber : undefined, opts.query);
  const releases = await jackettSearchMany(queries, { kind, sortBy: "seeders", limit: opts.limit });
  const allowedYears = await allowedReleaseYears(kind, title, kind === "series" ? seasonNumber : undefined);
  const annotated = releases
    .map((release) => applyReleaseMatch(
      release,
      buildReleaseMatch({
        kind,
        title,
        item: release,
        seasonNumber: kind === "series" ? seasonNumber : undefined,
        allowedYears,
      }),
    ))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.seeders ?? 0) - (a.seeders ?? 0));
  for (const release of annotated) {
    const item = {
      ...release,
      type: kind,
      tmdbId: title.tmdbId,
      tvdbId: title.tvdbId,
      titleHint: title.title,
      seasonNumber: kind === "series" ? seasonNumber : undefined,
    };
    cacheReleaseForTitle(item);
  }
  return annotated;
}

export async function nativeGrabRelease(
  kind: MediaKind,
  id: number,
  guid: string,
  indexerId: number | string,
  seasonNumber?: number,
): Promise<{ ok: true; infohash: string; added: boolean }> {
  keepCacheFresh();
  const title = await ensureTitle(kind, id);
  const item = cachedReleaseForTitle(kind, title.tmdbId, guid, indexerId);
  if (!item?.url) throw new Error("Release not in cache for this title; refresh release search and try again");
  if (item.tmdbId !== title.tmdbId) throw new Error("Release belongs to another title; refresh release search and try again");
  if (kind === "series" && seasonNumber != null && item.seasonNumber != null && item.seasonNumber !== seasonNumber) {
    throw new Error("Release belongs to another season; refresh release search and try again");
  }
  assertMovieReleaseMatchesTitle(kind, title, item);
  assertReleaseMatchAllowsGrab(item);
  const source = String(item.url);
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
    orderBy: [
      { addedAt: "desc" },
      { id: "asc" },
    ],
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

function statusFromTitle(input: {
  kind: MediaKind;
  tmdbId: number;
  title: string;
  jellyfinId: string | null;
  torrents: { progress: number; updatedAt: Date; state: string | null }[];
  updatedAt: Date;
}): MediaTitleStatus {
  const newestTorrent = [...input.torrents].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
  const progress = newestTorrent ? Math.round(newestTorrent.progress * 100) : null;
  if (input.jellyfinId) {
    return { ...input, status: "in_library", label: "В библиотеке", progress: 100, updatedAt: input.updatedAt };
  }
  if (!newestTorrent) {
    return { ...input, status: "registered", label: "Ждет релиза", progress: null, updatedAt: input.updatedAt };
  }
  if (progress != null && progress >= 100) {
    return { ...input, status: "awaiting_jellyfin", label: "Ждет Jellyfin", progress: 100, updatedAt: newestTorrent.updatedAt };
  }
  if (progress != null && progress > 0) {
    return { ...input, status: "downloading", label: `Качается ${progress}%`, progress, updatedAt: newestTorrent.updatedAt };
  }
  return { ...input, status: "release_selected", label: "Релиз выбран", progress, updatedAt: newestTorrent.updatedAt };
}

export async function getMediaTitleStatuses(ctx: MediaUserContext = {}): Promise<MediaTitleStatus[]> {
  await linkMediaTitlesToJellyfin().catch(() => {});
  const [titles, prefs] = await Promise.all([
    prisma.mediaTitle.findMany({
      include: {
        torrents: {
          select: { progress: true, updatedAt: true, state: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    }),
    listMediaPreferences(undefined, ctx.appUserId),
  ]);
  const byKey = new Map<string, MediaTitleStatus>();
  for (const title of titles) {
    const kind = title.kind === "series" ? "series" : "movie";
    byKey.set(`${kind}:${title.tmdbId}`, statusFromTitle({
      kind,
      tmdbId: title.tmdbId,
      title: title.title,
      jellyfinId: title.jellyfinId,
      torrents: title.torrents,
      updatedAt: title.updatedAt,
    }));
  }
  for (const pref of prefs.filter((item) => item.status === "watchlist")) {
    const key = `${pref.kind}:${pref.tmdbId}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      kind: pref.kind,
      tmdbId: pref.tmdbId,
      title: pref.title,
      status: "watchlist",
      label: "В списке",
      progress: null,
      jellyfinId: null,
      updatedAt: pref.updatedAt,
    });
  }
  return [...byKey.values()].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
}

export async function getTitleTorrents(kind: MediaKind, tmdbId: number): Promise<TorrentRailItem[]> {
  await linkMediaTitlesToJellyfin().catch(() => {});
  const downloads = await qbittorrentDownloads().catch(() => []);
  const byHash = new Map(downloads.map((download) => [download.hash.toLowerCase(), download]));
  const title = await prisma.mediaTitle.findUnique({
    where: { kind_tmdbId: { kind, tmdbId } },
    include: {
      torrents: {
        orderBy: [
          { addedAt: "desc" },
          { id: "asc" },
        ],
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
  ctx: MediaUserContext = {},
): Promise<SeriesPageDetail> {
  return await getMediaTitleDetail("series", id, { idType }, ctx) as SeriesPageDetail;
}

export async function nativeMovieDiscoverDetail(
  tmdbId: number,
  ctx: MediaUserContext = {},
): Promise<MoviePageDetail> {
  return await getMediaTitleDetail("movie", tmdbId, {}, ctx) as MoviePageDetail;
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
