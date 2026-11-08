import { createHmac, randomBytes } from "node:crypto";
import path from "node:path/posix";
import type { MusicDownload } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { log } from "../logger.js";
import { assertUserCanDownload, recordUserDownload, withUserDownloadLock } from "./downloadQuota.js";
import { jackettMusicSearch } from "./jackett.js";
import { getQbTorrents, MUSIC_TORRENT_CATEGORY, jellyfinRefresh, qbAddResolved } from "./media.js";
import { musicTorrentSource, resolveMusicTorrent } from "./musicTorrentSource.js";

const TTL = 15 * 60_000;
const handleKey = randomBytes(32);
interface Selection { owner: string; source: string; title: string; size: number; expires: number }
const handles = new Map<string, Selection>();

export class MusicRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function trimHandles(owner: string) {
  let owned = 0;
  for (const [id, item] of [...handles].reverse()) {
    if (item.expires <= Date.now() || (item.owner === owner && ++owned > 150)) handles.delete(id);
  }
  while (handles.size > 2048) handles.delete(handles.keys().next().value!);
}

export async function searchMusicReleases(owner: string, query: string) {
  const configured = config.media.jackett.configured;
  const qbConfigured = config.media.qbittorrent.configured;
  if (!configured) return { configured, qbConfigured, releases: [] };
  const results = await jackettMusicSearch(query);
  const sorted = results.sort((a, b) => query ? b.seeders - a.seeders :
    (Date.parse(b.publishDate ?? "") || 0) - (Date.parse(a.publishDate ?? "") || 0));
  const seen = new Set<string>();
  const releases = [];
  for (const item of sorted) {
    if (!/(?:^|[^\p{L}\p{N}])FLAC(?:$|[^\p{L}\p{N}])/iu.test(item.title)) continue;
    const source = musicTorrentSource(item.url)?.href;
    if (!source) continue;
    const key = item.infoHash?.toLowerCase() || source;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = createHmac("sha256", handleKey).update(JSON.stringify([owner, source])).digest("base64url");
    const title = item.title.slice(0, 500);
    const size = Math.max(0, item.size);
    handles.delete(id);
    handles.set(id, { owner, source, title, size, expires: Date.now() + TTL });
    releases.push({ id, title, indexer: item.indexer, size, seeders: item.reportedSeeders == null ? null : Math.max(0, item.reportedSeeders),
      quality: "FLAC", publishedAt: Number.isFinite(Date.parse(item.publishDate ?? "")) ? item.publishDate : null });
    if (releases.length === 50) break;
  }
  trimHandles(owner);
  return { configured, qbConfigured, releases };
}

function musicDirectory() {
  const { qbittorrentRoot, music } = config.mediaFs;
  if (!path.isAbsolute(qbittorrentRoot) || path.isAbsolute(music) ||
      music.split("/").some(part => !part || part === "." || part === "..")) {
    throw new MusicRequestError(503, "Не настроена папка музыкальной библиотеки");
  }
  return path.join(qbittorrentRoot, music);
}

type Torrent = Awaited<ReturnType<typeof getQbTorrents>>[number];
type GrabResult = { ok: true; id: string; added: boolean };
const inFlight = new Map<string, { owner: string; work: Promise<GrabResult> }>();

async function undoReservation(row: MusicDownload) {
  await prisma.$transaction(async tx => {
    const removed = await tx.musicDownload.deleteMany({ where: { id: row.id, submittedAt: null } });
    if (removed.count) await tx.userDownload.deleteMany({ where: { infohash: row.infohash, appUserId: row.appUserId } });
  });
}

async function submitMusicTorrent(item: Selection, source: Awaited<ReturnType<typeof resolveMusicTorrent>>): Promise<GrabResult> {
  const { infohash } = source;
  const savePath = musicDirectory();
  const existing = await prisma.musicDownload.findUnique({ where: { infohash } });
  if (existing && existing.appUserId !== item.owner) throw new MusicRequestError(409, "Этот релиз уже добавлен");
  if (existing?.submittedAt) return { ok: true, id: existing.id, added: false };

  const [live] = (await getQbTorrents({ hashes: infohash })).filter(t => t.hash?.toLowerCase() === infohash);
  if (live && (!existing || live.category !== MUSIC_TORRENT_CATEGORY || live.save_path !== savePath)) {
    throw new MusicRequestError(409, "Этот торрент уже есть в qBittorrent");
  }
  // Reserve the shared movie/music quota before sending bytes to qB. A process
  // restart between these writes is recovered by matching the actual infohash.
  const row = existing ?? await prisma.$transaction(async tx => {
    const used = await tx.userDownload.findUnique({ where: { infohash }, select: { id: true } });
    if (used) throw new MusicRequestError(409, "Этот торрент уже учтён в загрузках");
    await assertUserCanDownload(item.owner, null, tx);
    await recordUserDownload({ userId: item.owner, infohash, releaseTitle: item.title, size: item.size }, tx);
    return tx.musicDownload.create({ data: { appUserId: item.owner, infohash, title: item.title } });
  });

  if (!live) {
    try {
      await qbAddResolved(source, { category: MUSIC_TORRENT_CATEGORY, savePath, autoTMM: false });
    } catch (error) {
      // A timeout can follow a successful add. Check qB before undoing quota.
      const snapshot = await getQbTorrents({ hashes: infohash });
      if (!snapshot.some(t => t.hash?.toLowerCase() === infohash && t.category === MUSIC_TORRENT_CATEGORY && t.save_path === savePath)) {
        await undoReservation(row);
        throw error;
      }
    }
  }
  await prisma.musicDownload.update({ where: { id: row.id }, data: { submittedAt: new Date() } });
  return { ok: true, id: row.id, added: !live };
}

export async function grabMusicRelease(owner: string, id: string): Promise<GrabResult> {
  if (!config.media.jackett.configured || !config.media.qbittorrent.configured) {
    throw new MusicRequestError(503, "Jackett или qBittorrent не настроен");
  }
  const item = handles.get(id);
  if (!item || item.owner !== owner || item.expires <= Date.now()) {
    throw new MusicRequestError(410, "Обновите результаты поиска");
  }
  const source = await resolveMusicTorrent(item.source);
  const prior = inFlight.get(source.infohash);
  if (prior) {
    if (prior.owner !== owner) throw new MusicRequestError(409, "Этот релиз уже добавляется");
    return { ...await prior.work, added: false };
  }
  const work = withUserDownloadLock(owner, () => submitMusicTorrent(item, source));
  inFlight.set(source.infohash, { owner, work });
  try {
    return await work;
  } finally {
    inFlight.delete(source.infohash);
  }
}

export async function canControlLegacyTorrent(owner: string, infohash: string): Promise<boolean> {
  const [rows, music] = await Promise.all([
    getQbTorrents({ hashes: infohash }),
    prisma.musicDownload.findUnique({ where: { infohash }, select: { appUserId: true } }),
  ]);
  const torrent = rows.find(t => t.hash?.toLowerCase() === infohash);
  if (!torrent) return false;
  if (music) return music.appUserId === owner;
  return torrent.category !== MUSIC_TORRENT_CATEGORY;
}

function finished(t: Torrent) {
  return t.progress === 1 && !/moving|checking|error|missing/i.test(t.state ?? "");
}

function downloadStatus(row: MusicDownload, t?: Torrent): string {
  if (row.scanRequestedAt) return "scan-requested";
  if (!t) return row.submittedAt ? "missing" : "queued";
  if (finished(t)) return config.media.jellyfin.configured ? "scan-pending" : "downloaded";
  if (/error|missing/i.test(t.state ?? "")) return "error";
  if (/paused|stopped/i.test(t.state ?? "")) return "paused";
  if (/stalled/i.test(t.state ?? "")) return "stalled";
  if (/queued/i.test(t.state ?? "")) return "queued";
  return "downloading";
}

async function musicTorrents() {
  const torrents = await getQbTorrents({ category: MUSIC_TORRENT_CATEGORY });
  return new Map(torrents.filter(t => t.category === MUSIC_TORRENT_CATEGORY && t.hash).map(t => [t.hash!.toLowerCase(), t]));
}

export async function getMusicDownloads(owner: string) {
  const configured = config.media.qbittorrent.configured;
  if (!configured) return { configured, qbConfigured: false, downloads: [] };
  const rows = await prisma.musicDownload.findMany({ where: { appUserId: owner }, orderBy: { createdAt: "desc" }, take: 100 });
  const torrents = rows.some(r => !r.scanRequestedAt) ? await musicTorrents() : new Map<string, Torrent>();
  const downloads = rows.map(row => {
    const t = torrents.get(row.infohash);
    return { id: row.id, title: row.title, status: downloadStatus(row, t),
      progress: row.scanRequestedAt ? 100 : Math.max(0, Math.min(100, Math.floor((t?.progress || 0) * 100))) };
  });
  return { configured, qbConfigured: configured, downloads };
}

export async function reconcileMusicDownloads() {
  if (!config.media.qbittorrent.configured) return;
  const pending = await prisma.musicDownload.findMany({ where: { scanRequestedAt: null } });
  if (!pending.length) return;
  const torrents = await musicTorrents();
  const completed: string[] = [];
  const accepted: string[] = [];
  for (const row of pending) {
    if (inFlight.has(row.infohash)) continue;
    const t = torrents.get(row.infohash);
    if (!t) {
      if (!row.submittedAt && Date.now() - row.createdAt.getTime() > 10 * 60_000) await undoReservation(row);
      continue;
    }
    if (!row.submittedAt) accepted.push(row.id);
    if (finished(t)) completed.push(row.id);
  }
  if (accepted.length) await prisma.musicDownload.updateMany({ where: { id: { in: accepted } }, data: { submittedAt: new Date() } });
  if (completed.length && config.media.jellyfin.configured) {
    await jellyfinRefresh();
    await prisma.musicDownload.updateMany({ where: { id: { in: completed } }, data: { scanRequestedAt: new Date() } });
  }
}

let timer: NodeJS.Timeout | undefined;
export function startMusicDownloadMonitor() {
  if (timer) return;
  // Schedule the next tick after the current poll/scan has settled.
  const tick = async () => {
    try { await reconcileMusicDownloads(); }
    catch { log.warn("music", "Не удалось обновить музыкальные загрузки"); }
    timer = setTimeout(tick, 30_000);
    timer.unref();
  };
  timer = setTimeout(tick, 0);
  timer.unref();
}
