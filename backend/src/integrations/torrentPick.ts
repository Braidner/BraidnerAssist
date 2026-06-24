// Media v2 — торрент-нативный пайплайн: предпросмотр файлов торрента (через
// TorrServer, без скачивания) → пофайловый выбор серий → качаем только выбранное
// (qBittorrent filePrio) → сохраняем привязку торрент↔контент в SQLite, чтобы
// позже докачать ещё серии/сезон через ТОТ ЖЕ торрент (меняем приоритеты).

import { prisma } from "../db/client.js";
import { torrserverFiles } from "./torrserver.js";
import { qbApplySelection, qbFiles } from "./media.js";
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
    },
    update: { title: input.title, tmdbId: input.tmdbId ?? null, tvdbId: input.tvdbId ?? null },
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
  });
  return res;
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
  files: ContentTorrentFile[];
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

  const out: ContentTorrent[] = [];
  for (const t of torrents) {
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
