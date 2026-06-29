// Media v2 — торрент-нативный пайплайн: предпросмотр файлов торрента (через
// TorrServer, без скачивания) → пофайловый выбор серий → качаем только выбранное
// (qBittorrent filePrio) → сохраняем привязку торрент↔контент в SQLite, чтобы
// позже докачать ещё серии/сезон через ТОТ ЖЕ торрент (меняем приоритеты).

import { prisma } from "../db/client.js";
import { torrserverFiles } from "./torrserver.js";
import { qbAction, qbAddRaw, qbApplySelection, qbFiles, qbSetFilePrio, type SearchResult } from "./media.js";
import { parseEpisode, isVideoFile } from "./episodeParse.js";

export type ContentType = "movie" | "series";

export interface PreviewFile {
  fileIndex: number;
  path: string;
  length: number;
  isVideo: boolean;
  season: number | null;
  episodes: number[];
}
export interface TorrentPreview {
  infohash: string;
  title: string;
  files: PreviewFile[];
}

// Предпросмотр содержимого магнета/torrent-URL: дерево файлов с распарсенными сериями.
export async function previewTorrent(source: string): Promise<TorrentPreview> {
  const info = await torrserverFiles(source);
  const files: PreviewFile[] = info.files.map((f) => {
    const isVideo = isVideoFile(f.path);
    const { season, episodes } = isVideo ? parseEpisode(f.path) : { season: null, episodes: [] };
    return { fileIndex: f.index, path: f.path, length: f.length, isVideo, season, episodes };
  });
  return { infohash: info.hash.toLowerCase(), title: info.title, files };
}

interface ContentKey {
  contentType: ContentType;
  tmdbId?: number | null;
  tvdbId?: number | null;
}

export interface GrabInput extends ContentKey {
  title: string;
  source: string; // magnet / .torrent URL — нужен при первом добавлении
  infohash: string;
  files: PreviewFile[]; // ВСЕ файлы из предпросмотра
  wantedIndexes: number[]; // какие качать
  category?: string;
  savePath?: string;
}

// Грабим выбранные файлы и сохраняем привязку. Идемпотентно по infohash.
export async function grabSelected(input: GrabInput): Promise<{ infohash: string; added: boolean }> {
  const infohash = input.infohash.toLowerCase();

  // upsert торрента (по уникальному infohash).
  const torrent = await prisma.mediaTorrent.upsert({
    where: { infohash },
    create: {
      contentType: input.contentType,
      tmdbId: input.tmdbId ?? null,
      tvdbId: input.tvdbId ?? null,
      title: input.title,
      infohash,
      magnet: input.source.startsWith("magnet:") ? input.source : null,
      category: input.category ?? "mc-native",
    },
    update: { title: input.title, tmdbId: input.tmdbId ?? null, tvdbId: input.tvdbId ?? null, category: input.category ?? "mc-native" },
  });

  // Полный список файлов (перезаписываем — источник истины предпросмотр).
  const wanted = new Set(input.wantedIndexes);
  await prisma.mediaTorrentFile.deleteMany({ where: { torrentId: torrent.id } });
  await prisma.mediaTorrentFile.createMany({
    data: input.files.map((f) => ({
      torrentId: torrent.id,
      fileIndex: f.fileIndex,
      path: f.path,
      length: f.length,
      wanted: wanted.has(f.fileIndex),
      seasonNumber: f.season,
      episodeNumber: f.episodes[0] ?? null,
    })),
  });

  const res = await qbApplySelection({
    infohash,
    source: input.source,
    files: input.files.map((f) => ({ fileIndex: f.fileIndex, path: f.path })),
    wantedIndexes: input.wantedIndexes,
    category: input.category ?? "mc-native",
    savePath: input.savePath,
  });
  return res;
}

function base32ToHex(raw: string): string | null {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of raw.toUpperCase()) {
    const val = alphabet.indexOf(ch);
    if (val < 0) return null;
    bits += val.toString(2).padStart(5, "0");
  }
  let hex = "";
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.length >= 40 ? hex.slice(0, 40).toLowerCase() : null;
}

function infohashFromMagnet(source: string): string | null {
  if (!source.startsWith("magnet:")) return null;
  const xt = new URL(source).searchParams.get("xt") ?? "";
  const raw = xt.match(/btih:([^&]+)/i)?.[1];
  if (!raw) return null;
  if (/^[a-f0-9]{40}$/i.test(raw)) return raw.toLowerCase();
  if (/^[a-z2-7]{32}$/i.test(raw)) return base32ToHex(raw);
  return null;
}

function previewFileFromQb(f: { index: number; name: string; size: number }): PreviewFile {
  const isVideo = isVideoFile(f.name);
  const { season, episodes } = isVideo ? parseEpisode(f.name) : { season: null, episodes: [] };
  return {
    fileIndex: f.index,
    path: f.name,
    length: f.size,
    isVideo,
    season,
    episodes,
  };
}

async function waitForQbFiles(infohash: string): Promise<PreviewFile[]> {
  for (let i = 0; i < 25; i++) {
    const files = await qbFiles(infohash);
    if (files.length) return files.map(previewFileFromQb);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("qBittorrent ещё не получил метаданные торрента — повтори через минуту");
}

export async function grabFromQbMetadata(input: Omit<GrabInput, "infohash" | "files" | "wantedIndexes">): Promise<{ infohash: string; added: boolean }> {
  const addedIds = await qbAddRaw(input.source, {
    paused: true,
    category: input.category ?? "mc-native",
    savePath: input.savePath,
  });
  const infohash = addedIds[0]?.toLowerCase() ?? infohashFromMagnet(input.source);
  if (!infohash) throw new Error("qBittorrent добавил торрент, но не вернул hash");

  const files = await waitForQbFiles(infohash);
  const videos = files.filter((f) => f.isVideo);
  const wantedIndexes = input.contentType === "movie"
    ? [videos.slice().sort((a, b) => b.length - a.length)[0]?.fileIndex].filter((x): x is number => Number.isFinite(x))
    : videos.filter((f) => f.episodes.length > 0).map((f) => f.fileIndex);
  if (wantedIndexes.length === 0) throw new Error("No video files selected for release");

  const torrent = await prisma.mediaTorrent.upsert({
    where: { infohash },
    create: {
      contentType: input.contentType,
      tmdbId: input.tmdbId ?? null,
      tvdbId: input.tvdbId ?? null,
      title: input.title,
      infohash,
      magnet: input.source.startsWith("magnet:") ? input.source : null,
      category: input.category ?? "mc-native",
    },
    update: { title: input.title, tmdbId: input.tmdbId ?? null, tvdbId: input.tvdbId ?? null, category: input.category ?? "mc-native" },
  });

  const wanted = new Set(wantedIndexes);
  await prisma.mediaTorrentFile.deleteMany({ where: { torrentId: torrent.id } });
  await prisma.mediaTorrentFile.createMany({
    data: files.map((f) => ({
      torrentId: torrent.id,
      fileIndex: f.fileIndex,
      path: f.path,
      length: f.length,
      wanted: wanted.has(f.fileIndex),
      seasonNumber: f.season,
      episodeNumber: f.episodes[0] ?? null,
    })),
  });

  const unwantedIndexes = files.filter((f) => !wanted.has(f.fileIndex)).map((f) => f.fileIndex);
  if (unwantedIndexes.length) await qbSetFilePrio(infohash, unwantedIndexes, 0);
  if (wantedIndexes.length) await qbSetFilePrio(infohash, wantedIndexes, 1);
  await qbAction(infohash, "resume").catch(() => {});
  return { infohash, added: true };
}

// Докачать ещё файлы (серии/сезон) через уже добавленный торрент: объединяем с
// текущим набором wanted, выставляем приоритеты, обновляем флаги в БД.
export async function setWantedFiles(infohash: string, addIndexes: number[]): Promise<{ infohash: string }> {
  const hash = infohash.toLowerCase();
  const torrent = await prisma.mediaTorrent.findUnique({ where: { infohash: hash }, include: { files: true } });
  if (!torrent) throw new Error("Привязка торрента не найдена");

  const add = new Set(addIndexes);
  const wantedIndexes = [
    ...new Set([...torrent.files.filter((f) => f.wanted).map((f) => f.fileIndex), ...add]),
  ];

  await qbApplySelection({
    infohash: hash,
    source: torrent.magnet ?? undefined,
    files: torrent.files.map((f) => ({ fileIndex: f.fileIndex, path: f.path })),
    wantedIndexes,
  });

  const wantedSet = new Set(wantedIndexes);
  await Promise.all(
    torrent.files.map((f) =>
      prisma.mediaTorrentFile.update({ where: { id: f.id }, data: { wanted: wantedSet.has(f.fileIndex) } }),
    ),
  );
  return { infohash: hash };
}

export interface ContentTorrentFile {
  fileIndex: number;
  path: string;
  length: number;
  wanted: boolean;
  seasonNumber: number | null;
  episodeNumber: number | null;
  progress: number; // 0..1 из qB (0 если не качается)
}
export interface ContentTorrent {
  infohash: string;
  title: string;
  magnet: string | null;
  selectedRelease: SearchResult | null;
  selectedTitle: string | null;
  selectedIndexer: string | null;
  selectedSeasonNumber: number | null;
  selectedAt: string | null;
  files: ContentTorrentFile[];
}

function parseSelectedRelease(value?: string | null): SearchResult | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as SearchResult;
  } catch {
    return null;
  }
}

// Торренты, привязанные к тайтлу (для карточки «Уже качается из этого торрента»).
// Прогресс по файлам подтягиваем из qB на лету (по индексу файла).
export async function listContentTorrents(key: ContentKey): Promise<ContentTorrent[]> {
  const or: Record<string, number>[] = [];
  if (key.tmdbId) or.push({ tmdbId: key.tmdbId });
  if (key.tvdbId) or.push({ tvdbId: key.tvdbId });
  if (or.length === 0) return [];

  const torrents = await prisma.mediaTorrent.findMany({
    where: { contentType: key.contentType, OR: or },
    include: { files: true },
    orderBy: { createdAt: "desc" },
  });
  const decisions = torrents.length
    ? await prisma.mediaReleaseDecision.findMany({
        where: {
          kind: key.contentType,
          selected: true,
          selectedInfohash: { in: torrents.map((t) => t.infohash) },
        },
        orderBy: { selectedAt: "desc" },
      }).catch(() => [])
    : [];
  const decisionByHash = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) {
    if (d.selectedInfohash && !decisionByHash.has(d.selectedInfohash)) {
      decisionByHash.set(d.selectedInfohash, d);
    }
  }

  const out: ContentTorrent[] = [];
  for (const t of torrents) {
    const decision = decisionByHash.get(t.infohash);
    const selectedRelease = parseSelectedRelease(decision?.selectedReleaseJson);
    let prog = new Map<number, number>();
    try {
      const qf = await qbFiles(t.infohash);
      prog = new Map(qf.map((f) => [f.index, f.progress]));
    } catch {
      /* qB недоступен — отдадим без прогресса */
    }
    out.push({
      infohash: t.infohash,
      title: t.title,
      magnet: t.magnet,
      selectedRelease,
      selectedTitle: decision?.title ?? null,
      selectedIndexer: decision?.indexer ?? null,
      selectedSeasonNumber: decision?.seasonNumber ?? null,
      selectedAt: decision?.selectedAt?.toISOString() ?? null,
      files: t.files
        .slice()
        .sort((a, b) => a.fileIndex - b.fileIndex)
        .map((f) => ({
          fileIndex: f.fileIndex,
          path: f.path,
          length: f.length,
          wanted: f.wanted,
          seasonNumber: f.seasonNumber,
          episodeNumber: f.episodeNumber,
          progress: prog.get(f.fileIndex) ?? 0,
        })),
    });
  }
  return out;
}
