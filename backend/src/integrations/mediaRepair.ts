import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../db/client.js";
import { config } from "../config.js";
import { jellyfinRefresh, qbFiles, qbRenameFile, type QbFile } from "./media.js";

const VIDEO_EXT = new Set(["mkv", "mp4", "avi", "m4v", "mov", "ts", "webm", "wmv"]);

export interface RepairTorrentFile {
  index: number;
  name: string;
  size: number;
  priority: number;
  progress: number;
  ext: string;
  isVideo: boolean;
  warning: string | null;
}

export interface RepairEpisodeResult {
  ok: true;
  sourcePath: string;
  destPath: string;
  qbitPath: string;
  sameFile: boolean;
}

function posixParts(value: string): string[] {
  return value.replace(/\\/g, "/").split("/").filter(Boolean);
}

function qbitFileParts(value: string): string[] {
  const parts = posixParts(value);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("Путь файла торрента выходит за пределы savePath");
  }
  return parts;
}

function cleanSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Episode";
}

function safeInside(base: string, relPath: string): string {
  const clean = String(relPath ?? "").replace(/\0/g, "").replace(/^[/\\]+/, "");
  const baseAbs = path.resolve(base);
  const abs = path.resolve(baseAbs, clean);
  if (abs !== baseAbs && !abs.startsWith(baseAbs + path.sep)) {
    throw new Error("Путь вне медиатеки");
  }
  return abs;
}

export function qbitSavePathToMediaRel(savePath: string): string {
  const qRoot = `/${posixParts(config.mediaFs.qbittorrentRoot ?? "/data").join("/")}`;
  const save = `/${posixParts(savePath).join("/")}`;
  if (save !== qRoot && !save.startsWith(`${qRoot}/`)) {
    throw new Error("savePath торрента вне QBITTORRENT_SAVE_ROOT");
  }
  return save.slice(qRoot.length).replace(/^\/+/, "");
}

export function episodeTargetName(title: string, seasonNumber: number, episodeNumber: number, ext: string): string {
  const s = String(seasonNumber).padStart(2, "0");
  const e = String(episodeNumber).padStart(2, "0");
  return `${cleanSegment(title)} - S${s}E${e}.${ext.toLowerCase()}`;
}

export function looksLikeMultiEpisodeFile(name: string): boolean {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  return /\bS\d{1,2}[._\s-]?E\d{1,3}(?:[._\s-]?E\d{1,3}|[._\s-]?-[._\s-]?E?\d{1,3})\b/i.test(base)
    || /\b\d{1,2}x\d{1,3}-\d{1,3}\b/i.test(base)
    || /\b(?:complete|all episodes|все серии|полный сезон|сборник)\b/i.test(base)
    || /\b(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\b/.test(base);
}

function fileToRepairFile(file: QbFile): RepairTorrentFile {
  const ext = path.posix.extname(file.name.replace(/\\/g, "/")).slice(1).toLowerCase();
  const isVideo = VIDEO_EXT.has(ext);
  return {
    index: file.index,
    name: file.name,
    size: file.size,
    priority: file.priority,
    progress: file.progress,
    ext,
    isVideo,
    warning: isVideo && looksLikeMultiEpisodeFile(file.name) ? "Похоже на мультисерийный или сборный файл" : null,
  };
}

async function titleTorrent(tmdbId: number, hash: string) {
  const normalizedHash = hash.toLowerCase();
  const title = await prisma.mediaTitle.findUnique({
    where: { kind_tmdbId: { kind: "series", tmdbId } },
    include: { torrents: true },
  });
  if (!title) throw new Error("Тайтл не найден в registry");
  const torrent = title.torrents.find((row) => row.infohash.toLowerCase() === normalizedHash);
  if (!torrent) throw new Error("Раздача не привязана к этому сериалу");
  if (!torrent.savePath) throw new Error("У раздачи нет savePath");
  return { title, torrent };
}

export async function listTitleTorrentFiles(tmdbId: number, hash: string): Promise<RepairTorrentFile[]> {
  await titleTorrent(tmdbId, hash);
  return (await qbFiles(hash)).map(fileToRepairFile);
}

export async function repairSeriesEpisode(input: {
  tmdbId: number;
  hash: string;
  fileIndex: number;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<RepairEpisodeResult> {
  if (!config.mediaFs.configured) throw new Error("MEDIA_ROOT не настроен");
  if (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 0 || input.seasonNumber > 99) {
    throw new Error("Некорректный номер сезона");
  }
  if (!Number.isInteger(input.episodeNumber) || input.episodeNumber <= 0 || input.episodeNumber > 999) {
    throw new Error("Некорректный номер серии");
  }

  const { title, torrent } = await titleTorrent(input.tmdbId, input.hash);
  const files = await qbFiles(input.hash);
  const selected = files.find((file) => file.index === input.fileIndex);
  if (!selected) throw new Error("Файл не найден в qBittorrent");
  const selectedMeta = fileToRepairFile(selected);
  if (!selectedMeta.isVideo) throw new Error("Можно привязать только видеофайл");

  const mediaRoot = path.resolve(config.mediaFs.root!);
  const titleRel = qbitSavePathToMediaRel(torrent.savePath!);
  const sourceParts = qbitFileParts(selected.name);
  const sourceAbs = safeInside(mediaRoot, path.posix.join(titleRel, ...sourceParts));
  const ext = selectedMeta.ext;
  const seasonDir = `Season ${String(input.seasonNumber).padStart(2, "0")}`;
  const targetFile = episodeTargetName(title.title, input.seasonNumber, input.episodeNumber, ext);
  const targetRel = path.posix.join(titleRel, seasonDir, targetFile);
  const targetAbs = safeInside(mediaRoot, targetRel);
  const qbitTargetPath = path.posix.join(seasonDir, targetFile);

  let sourceReal = "";
  try {
    sourceReal = await fs.realpath(sourceAbs);
  } catch {
    throw new Error("Исходный файл не найден на диске");
  }

  let sameFile = false;
  try {
    const targetReal = await fs.realpath(targetAbs);
    sameFile = targetReal === sourceReal;
    if (!sameFile) throw new Error("Целевой файл уже существует");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" && !sameFile) throw e;
  }

  if (!sameFile) {
    await fs.mkdir(path.dirname(targetAbs), { recursive: true });
    await qbRenameFile(input.hash.toLowerCase(), selected.name, qbitTargetPath);
  }
  await jellyfinRefresh().catch(() => {});

  return {
    ok: true,
    sourcePath: `/${path.posix.join(titleRel, ...sourceParts)}`,
    destPath: `/${targetRel}`,
    qbitPath: qbitTargetPath,
    sameFile,
  };
}
