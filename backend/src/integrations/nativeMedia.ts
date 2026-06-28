import { prisma } from "../db/client.js";
import { config } from "../config.js";
import { jackettHealth, jackettSearch } from "./jackett.js";
import { listQualityProfiles, getQualityProfile, scoreRelease } from "./releaseScore.js";
import { tmdbDetails, tmdbSearch, tmdbSeason, tmdbTvSeasons, tmdbTvToTvdb, tmdbFindByTvdb, type TmdbItem } from "./tmdb.js";
import { previewTorrent, grabSelected } from "./torrentPick.js";
import { organizeTorrent } from "./files.js";
import { qbittorrentDownloads, type SearchResult, type SeriesPageDetail, type MoviePageDetail, type DetailSeason } from "./media.js";

type MediaKind = "movie" | "series";

export interface MediaLookupItem {
  kind: MediaKind;
  id: number; // native: tmdbId for both movie and series
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

export interface NativeManualImportFile {
  id: number;
  path: string;
  relativePath: string;
  size: number;
  seasonNumber: number | null;
  episodeNumbers: number[];
  quality: string | null;
  languages: string[];
  rejected: boolean;
  rejections: string[];
}

const releaseCache = new Map<string, { at: number; item: SearchResult & { type: MediaKind; tmdbId?: number | null; tvdbId?: number | null; titleHint: string } }>();
const CACHE_TTL = 10 * 60_000;

function cacheKey(type: MediaKind, guid: string, indexerId: number | string): string {
  return `${type}:${indexerId}:${guid}`;
}

function keepCacheFresh(): void {
  const now = Date.now();
  for (const [k, v] of releaseCache) if (now - v.at > CACHE_TTL) releaseCache.delete(k);
}

async function monitorFor(kind: MediaKind, id: number) {
  if (kind === "series") {
    const byTmdb = await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind, tmdbId: id } } });
    if (byTmdb) return byTmdb;
    return prisma.mediaMonitor.findFirst({ where: { kind, tvdbId: id } });
  }
  return prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind, tmdbId: id } } });
}

async function lookupItem(item: TmdbItem): Promise<MediaLookupItem> {
  const tvdbId = item.kind === "series" ? await tmdbTvToTvdb(item.tmdbId).catch(() => null) : null;
  const monitor = await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind: item.kind, tmdbId: item.tmdbId } } });
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
    added: Boolean(monitor),
    monitored: monitor?.monitored ?? false,
  };
}

export async function nativeLookup(kind: MediaKind, query: string): Promise<MediaLookupItem[]> {
  const items = (await tmdbSearch(query)).filter((i) => i.kind === kind);
  return Promise.all(items.slice(0, 12).map(lookupItem));
}

export async function nativeLookupAll(query: string): Promise<MediaLookupItem[]> {
  const items = await tmdbSearch(query);
  return Promise.all(items.slice(0, 16).map(lookupItem));
}

export async function nativeAdd(kind: MediaKind, id: number, opts: { monitored?: boolean; searchMode?: "manual" | "automatic" | "paused"; qualityProfileName?: string | null } = {}): Promise<{ title: string; monitorId: string; alreadyInLibrary: boolean }> {
  let tmdbId = id;
  if (kind === "series") {
    const resolved = await tmdbFindByTvdb(id).catch(() => null);
    if (resolved) tmdbId = resolved;
  }
  const detail = await tmdbDetails(kind, tmdbId);
  if (!detail) throw new Error("TMDB title not found");
  const tvdbId = kind === "series" ? await tmdbTvToTvdb(tmdbId).catch(() => null) : null;
  const profile = await getQualityProfile(opts.qualityProfileName);
  const existing = await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind, tmdbId } } });
  const monitor = await prisma.mediaMonitor.upsert({
    where: { kind_tmdbId: { kind, tmdbId } },
    create: {
      kind,
      tmdbId,
      tvdbId,
      title: detail.title,
      year: detail.year,
      poster: detail.poster,
      backdrop: detail.backdrop,
      overview: detail.overview,
      monitored: opts.monitored ?? true,
      searchMode: opts.searchMode ?? "manual",
      qualityProfileId: (await prisma.mediaQualityProfile.findUnique({ where: { name: profile.name } }))?.id,
    },
    update: {
      tvdbId,
      title: detail.title,
      year: detail.year,
      poster: detail.poster,
      backdrop: detail.backdrop,
      overview: detail.overview,
      monitored: opts.monitored ?? true,
    },
  });

  if (kind === "series") await syncMonitorEpisodes(monitor.id, tmdbId).catch(() => {});
  await prisma.mediaImportEvent.create({ data: { monitorId: monitor.id, level: "info", message: "monitor added", payload: JSON.stringify({ kind, tmdbId }) } }).catch(() => {});
  return { title: detail.title, monitorId: monitor.id, alreadyInLibrary: Boolean(existing) };
}

export async function syncMonitorEpisodes(monitorId: string, tmdbId: number): Promise<void> {
  const seasons = await tmdbTvSeasons(tmdbId);
  for (const seasonNumber of seasons) {
    await prisma.mediaMonitorSeason.upsert({
      where: { monitorId_seasonNumber: { monitorId, seasonNumber } },
      create: { monitorId, seasonNumber },
      update: {},
    });
    const eps = await tmdbSeason(tmdbId, seasonNumber).catch(() => []);
    for (const ep of eps) {
      await prisma.mediaMonitorEpisode.upsert({
        where: { monitorId_seasonNumber_episodeNumber: { monitorId, seasonNumber, episodeNumber: ep.episodeNumber } },
        create: {
          monitorId,
          seasonNumber,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          airDate: ep.airDate ? new Date(ep.airDate) : null,
          status: ep.airDate && new Date(ep.airDate).getTime() > Date.now() ? "upcoming" : "wanted",
        },
        update: {
          title: ep.title,
          airDate: ep.airDate ? new Date(ep.airDate) : null,
        },
      });
    }
  }
}

export async function nativeReleaseSearch(kind: MediaKind, id: number, seasonNumber?: number): Promise<SearchResult[]> {
  keepCacheFresh();
  const monitor = await monitorFor(kind, id);
  let tmdbId = monitor?.tmdbId ?? id;
  let tvdbId = monitor?.tvdbId ?? null;
  if (kind === "series" && !monitor) {
    const resolved = await tmdbFindByTvdb(id).catch(() => null);
    if (resolved) {
      tmdbId = resolved;
      tvdbId = id;
    }
  }
  const detail = monitor ? null : await tmdbDetails(kind, tmdbId).catch(() => null);
  const title = monitor?.title ?? detail?.title ?? String(id);
  const query = kind === "series" && seasonNumber != null ? `${title} S${String(seasonNumber).padStart(2, "0")}` : title;
  const profileName = monitor?.qualityProfileId
    ? (await prisma.mediaQualityProfile.findUnique({ where: { id: monitor.qualityProfileId } }))?.name
    : null;
  const releases = await jackettSearch(query, { kind, profileName });
  for (const r of releases) {
    releaseCache.set(cacheKey(kind, r.guid, r.indexer), { at: Date.now(), item: { ...r, type: kind, tmdbId, tvdbId, titleHint: title } });
  }
  await Promise.all(releases.slice(0, 20).map((r) =>
    prisma.mediaReleaseDecision.create({
      data: {
        monitorId: monitor?.id,
        kind,
        tmdbId,
        tvdbId,
        query,
        guid: r.guid,
        title: r.title,
        indexer: r.indexer,
        score: r.score ?? 0,
        reasons: JSON.stringify(r.scoreReasons ?? []),
        warnings: JSON.stringify(r.warnings ?? []),
      },
    }).catch(() => null),
  ));
  if (monitor) await prisma.mediaMonitor.update({ where: { id: monitor.id }, data: { lastSearchAt: new Date(), lastError: null } }).catch(() => {});
  return releases;
}

export async function nativeGrabRelease(kind: MediaKind, guid: string, indexerId: number | string): Promise<{ ok: true; infohash: string; added: boolean }> {
  keepCacheFresh();
  const cached = releaseCache.get(cacheKey(kind, guid, indexerId)) ?? [...releaseCache.values()].find((v) => v.item.type === kind && v.item.guid === guid);
  const source = cached?.item.url;
  if (!source) throw new Error("Release not in cache; run search_releases first");
  const item = cached.item;
  const preview = await previewTorrent(source);
  const videoFiles = preview.files.filter((f) => f.isVideo);
  const wantedIndexes = item.type === "movie"
    ? [videoFiles.slice().sort((a, b) => b.length - a.length)[0]?.fileIndex].filter((x): x is number => Number.isFinite(x))
    : videoFiles.filter((f) => f.episodes.length > 0).map((f) => f.fileIndex);
  if (wantedIndexes.length === 0) throw new Error("No video files selected for release");
  const res = await grabSelected({
    contentType: item.type,
    tmdbId: item.tmdbId,
    tvdbId: item.tvdbId,
    title: item.titleHint,
    source,
    infohash: preview.infohash,
    files: preview.files,
    wantedIndexes,
    category: "mc-native",
  });
  const monitor = item.tmdbId ? await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind: item.type, tmdbId: item.tmdbId } } }) : null;
  if (monitor) await prisma.mediaMonitor.update({ where: { id: monitor.id }, data: { lastGrabAt: new Date() } }).catch(() => {});
  await prisma.mediaReleaseDecision.updateMany({ where: { kind: item.type, guid }, data: { selected: true } }).catch(() => {});
  return { ok: true, ...res };
}

export async function nativeImportCandidates(_kind: MediaKind, downloadId: string): Promise<NativeManualImportFile[]> {
  const torrent = await prisma.mediaTorrent.findUnique({ where: { infohash: downloadId.toLowerCase() }, include: { files: true } });
  if (!torrent) return [];
  const profile = await getQualityProfile();
  return torrent.files.filter((f) => f.wanted).map((f) => {
    const scored = scoreRelease({ title: f.path, size: f.length, seeders: 1, profile, kind: torrent.contentType as MediaKind });
    return {
      id: f.fileIndex,
      path: f.path,
      relativePath: f.path,
      size: f.length,
      seasonNumber: f.seasonNumber,
      episodeNumbers: f.episodeNumber == null ? [] : [f.episodeNumber],
      quality: scored.parsed.resolution ? `${scored.parsed.resolution}p` : null,
      languages: scored.parsed.languages,
      rejected: Boolean(f.importError),
      rejections: f.importError ? [f.importError] : [],
    };
  });
}

export async function nativeImportRelease(_kind: MediaKind, downloadId: string, fileIds?: number[]): Promise<number> {
  if (fileIds?.length) {
    const torrent = await prisma.mediaTorrent.findUnique({ where: { infohash: downloadId.toLowerCase() }, include: { files: true } });
    if (torrent) {
      const keep = new Set(fileIds);
      await Promise.all(torrent.files.map((f) => prisma.mediaTorrentFile.update({ where: { id: f.id }, data: { wanted: keep.has(f.fileIndex) } })));
    }
  }
  const res = await organizeTorrent(downloadId);
  return res.organized;
}

export async function nativeSetMonitored(kind: MediaKind, id: number, monitored: boolean, seasonNumber?: number): Promise<void> {
  const monitor = await monitorFor(kind, id) ?? (await nativeAdd(kind, id, { monitored })).monitorId;
  const monitorId = typeof monitor === "string" ? monitor : monitor.id;
  if (seasonNumber != null) {
    await prisma.mediaMonitorSeason.upsert({
      where: { monitorId_seasonNumber: { monitorId, seasonNumber } },
      create: { monitorId, seasonNumber, monitored },
      update: { monitored },
    });
  } else {
    await prisma.mediaMonitor.update({ where: { id: monitorId }, data: { monitored } });
  }
}

export async function nativeCalendar(days = 14) {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.mediaMonitorEpisode.findMany({
    where: { airDate: { gte: since, lte: until }, monitor: { monitored: true } },
    include: { monitor: true },
    orderBy: { airDate: "asc" },
  });
  return rows.map((e) => ({
    kind: "episode",
    title: `${e.monitor.title} S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")}`,
    seriesTitle: e.monitor.title,
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
    airDate: e.airDate?.toISOString() ?? null,
    hasFile: Boolean(e.importedPath) || e.status === "downloaded",
    monitored: e.monitored && e.monitor.monitored,
    status: e.status,
  }));
}

export async function nativeRepair() {
  const torrents = await prisma.mediaTorrent.findMany({
    where: { OR: [{ importStatus: { in: ["failed", "needs_review", "completed"] } }, { files: { some: { importError: { not: null } } } }] },
    include: { files: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const missing = await prisma.mediaMonitorEpisode.findMany({
    where: { status: { in: ["wanted", "downloading"] }, monitor: { monitored: true } },
    include: { monitor: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return {
    jackett: await jackettHealth().catch((e) => [{ id: "all", configured: config.media.jackett.configured, ok: false, latencyMs: null, resultCount: 0, lastError: String(e), checkedAt: new Date().toISOString() }]),
    torrents: torrents.map((t) => ({
      infohash: t.infohash,
      title: t.title,
      contentType: t.contentType,
      importStatus: t.importStatus,
      progress: t.progress,
      lastError: t.lastError,
      files: t.files.filter((f) => f.importError || (f.wanted && !f.importedPath)).map((f) => ({ fileIndex: f.fileIndex, path: f.path, error: f.importError, importedPath: f.importedPath })),
    })),
    missing: missing.map((e) => ({ monitorId: e.monitorId, title: e.monitor.title, seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber, airDate: e.airDate, status: e.status })),
  };
}

export async function nativeMonitorList() {
  return prisma.mediaMonitor.findMany({ include: { seasons: true }, orderBy: { updatedAt: "desc" } });
}

export async function nativeSeriesDiscoverDetail(id: number): Promise<SeriesPageDetail> {
  const tmdbId = await tmdbFindByTvdb(id).catch(() => null) ?? id;
  const detail = await tmdbDetails("series", tmdbId);
  if (!detail) throw new Error("series not found in TMDB");
  const tvdbId = await tmdbTvToTvdb(tmdbId).catch(() => null);
  const monitor = await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind: "series", tmdbId } } });
  const imported = await prisma.mediaTorrentFile.findMany({
    where: { torrent: { contentType: "series", OR: [{ tmdbId }, ...(tvdbId ? [{ tvdbId }] : [])] }, importedPath: { not: null } },
  });
  const fileKeys = new Set(imported.map((f) => `S${f.seasonNumber}E${f.episodeNumber}`));
  const seasonNumbers = await tmdbTvSeasons(tmdbId).catch(() => []);
  const seasons: DetailSeason[] = [];
  for (const seasonNumber of seasonNumbers) {
    const eps = await tmdbSeason(tmdbId, seasonNumber).catch(() => []);
    seasons.push({
      seasonNumber,
      episodes: eps.map((e) => ({
        seasonNumber,
        episodeNumber: e.episodeNumber,
        title: e.title,
        airDate: e.airDate,
        hasFile: fileKeys.has(`S${seasonNumber}E${e.episodeNumber}`),
        quality: null,
        size: null,
        jellyfinId: null,
        played: false,
      })),
      fileCount: eps.filter((e) => fileKeys.has(`S${seasonNumber}E${e.episodeNumber}`)).length,
      totalCount: eps.length,
      monitored: monitor?.monitored ?? false,
    });
  }
  return {
    jellyfinId: "",
    title: detail.title,
    year: detail.year,
    overview: detail.overview,
    genres: detail.genres,
    network: null,
    status: null,
    runtime: detail.runtime,
    rating: detail.rating,
    posterRemote: detail.poster,
    backdropRemote: detail.backdrop,
    tvdbId,
    inArr: Boolean(monitor),
    monitored: monitor?.monitored ?? false,
    seasons,
  };
}

export async function nativeMovieDiscoverDetail(tmdbId: number): Promise<MoviePageDetail> {
  const detail = await tmdbDetails("movie", tmdbId);
  if (!detail) throw new Error("movie not found in TMDB");
  const monitor = await prisma.mediaMonitor.findUnique({ where: { kind_tmdbId: { kind: "movie", tmdbId } } });
  const file = await prisma.mediaTorrentFile.findFirst({
    where: { torrent: { contentType: "movie", tmdbId }, importedPath: { not: null } },
    orderBy: { importedAt: "desc" },
  });
  return {
    jellyfinId: "",
    title: detail.title,
    year: detail.year,
    overview: detail.overview,
    genres: detail.genres,
    studio: null,
    status: null,
    runtime: detail.runtime,
    rating: detail.rating,
    posterRemote: detail.poster,
    backdropRemote: detail.backdrop,
    tmdbId,
    inArr: Boolean(monitor),
    monitored: monitor?.monitored ?? false,
    hasFile: Boolean(file),
    quality: null,
    size: file?.length ?? null,
  };
}

export async function nativeImporterTick(): Promise<void> {
  const downloads = await qbittorrentDownloads().catch(() => []);
  for (const d of downloads) {
    const hash = d.hash.toLowerCase();
    if (d.category && d.category !== "mc-native") continue;
    const torrent = await prisma.mediaTorrent.findUnique({ where: { infohash: hash } });
    if (!torrent) continue;
    const completed = d.progress >= 100 || ["uploading", "stalledUP", "pausedUP", "queuedUP", "checkingUP", "forcedUP"].includes(d.state);
    await prisma.mediaTorrent.update({
      where: { id: torrent.id },
      data: {
        progress: Math.max(0, Math.min(1, d.progress / 100)),
        completedAt: completed && !torrent.completedAt ? new Date() : torrent.completedAt,
        importStatus: completed && ["queued", "downloading"].includes(torrent.importStatus) ? "completed" : torrent.importStatus,
      },
    }).catch(() => {});
    if (completed && !["imported", "importing", "ignored"].includes(torrent.importStatus)) {
      await organizeTorrent(hash).catch(async (e) => {
        await prisma.mediaTorrent.update({ where: { id: torrent.id }, data: { importStatus: "failed", lastError: String(e) } }).catch(() => {});
      });
    }
  }
}

export { listQualityProfiles };
