// Media v2 (Фаза 3) — файловый менеджер медиатеки + органайзер «торрент → библиотека».
// ВСЕ операции жёстко заперты в MEDIA_ROOT (анти-traversal): list/mkdir/rename/move/
// delete. Органайзер раскладывает скачанные файлы в layout Jellyfin (hardlink, тот же
// том) по маппингу MediaTorrentFile (Фаза 2) — заменяет импорт Sonarr/Radarr.

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { jellyfinRefresh } from "./media.js";

const root = () => config.mediaFs.root!;

// Преобразовать относительный путь → абсолютный ВНУТРИ корня. Бросает при выходе
// за пределы (../, абсолютные пути, нулевые байты). Лексическая проверка.
function safe(rel: string): string {
  if (!config.mediaFs.configured) throw new Error("MEDIA_ROOT не настроен");
  const clean = String(rel ?? "").replace(/\0/g, "").replace(/^[/\\]+/, "");
  const base = path.resolve(root());
  const abs = path.resolve(base, clean);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error("Путь вне медиатеки");
  }
  return abs;
}

// Относительный путь от корня (для отдачи клиенту).
function rel(abs: string): string {
  const r = path.relative(path.resolve(root()), abs);
  return r.split(path.sep).join("/");
}

export interface FileEntry {
  name: string;
  path: string; // относительный от корня
  type: "dir" | "file";
  size: number;
  mtime: number; // ms
  ext: string;
}

// Список содержимого папки (по умолчанию — корень).
export async function listDir(relPath = ""): Promise<{ path: string; entries: FileEntry[] }> {
  const abs = safe(relPath);
  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const entries: FileEntry[] = [];
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue; // скрытые/системные не показываем
    const childAbs = path.join(abs, d.name);
    let size = 0;
    let mtime = 0;
    try {
      const st = await fs.stat(childAbs);
      size = st.size;
      mtime = st.mtimeMs;
    } catch {
      continue; // битые симлинки и т.п.
    }
    const isDir = d.isDirectory();
    entries.push({
      name: d.name,
      path: rel(childAbs),
      type: isDir ? "dir" : "file",
      size: isDir ? 0 : size,
      mtime,
      ext: isDir ? "" : path.extname(d.name).slice(1).toLowerCase(),
    });
  }
  // папки сверху, затем по имени.
  entries.sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name, "ru")));
  return { path: rel(abs), entries };
}

export async function makeDir(parentRel: string, name: string): Promise<void> {
  if (!name.trim() || /[/\\]/.test(name)) throw new Error("Недопустимое имя папки");
  const abs = safe(path.join(parentRel, name));
  await fs.mkdir(abs, { recursive: true });
}

export async function renameEntry(targetRel: string, newName: string): Promise<void> {
  if (!newName.trim() || /[/\\]/.test(newName)) throw new Error("Недопустимое имя");
  const abs = safe(targetRel);
  const dest = safe(path.join(path.dirname(targetRel), newName));
  await fs.rename(abs, dest);
}

export async function moveEntry(srcRel: string, destDirRel: string): Promise<void> {
  const src = safe(srcRel);
  const destDir = safe(destDirRel);
  const dest = path.join(destDir, path.basename(src));
  await fs.mkdir(destDir, { recursive: true });
  await fs.rename(src, dest);
}

export async function removeEntry(targetRel: string): Promise<void> {
  const abs = safe(targetRel);
  if (abs === path.resolve(root())) throw new Error("Нельзя удалить корень");
  await fs.rm(abs, { recursive: true, force: true });
}

// ── Органайзер: торрент → библиотека ────────────────────────────────────
// Раскладываем скачанные (wanted) файлы привязанного торрента в layout Jellyfin
// через HARDLINK (тот же том downloads↔library → мгновенно, без копии, торрент
// продолжает сидировать). Сериал → tv/{Show}/Season NN/{Show} - SxxExx.ext;
// фильм → movies/{Title}/{Title}.ext. Имена файлов в библиотеке предсказуемы для
// матчинга Jellyfin. Возвращает число разложенных файлов.
const VIDEO_EXT = /\.(mkv|mp4|avi|m4v|mov|ts|webm|wmv|flv|mpg|mpeg)$/i;
const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "Untitled";
const pad2 = (n: number) => String(n).padStart(2, "0");

export interface OrganizedFileResult {
  fileIndex: number;
  path: string;
  status: "imported" | "skipped" | "failed";
  importedPath: string | null;
  message: string;
}

export async function organizeTorrent(infohash: string): Promise<{ organized: number; skipped: number; failed: number; files: OrganizedFileResult[] }> {
  if (!config.mediaFs.configured) throw new Error("MEDIA_ROOT не настроен");
  const hash = infohash.toLowerCase();
  const torrent = await prisma.mediaTorrent.findUnique({ where: { infohash: hash }, include: { files: true } });
  if (!torrent) throw new Error("Привязка торрента не найдена");

  const dlRoot = path.join(path.resolve(root()), config.mediaFs.downloads);
  const libRoot = path.join(
    path.resolve(root()),
    torrent.contentType === "series" ? config.mediaFs.tv : config.mediaFs.movies,
  );
  const showName = sanitize(torrent.title);

  let organized = 0;
  let skipped = 0;
  let failed = 0;
  const results: OrganizedFileResult[] = [];
  await prisma.mediaTorrent.update({ where: { id: torrent.id }, data: { importStatus: "importing", lastError: null } }).catch(() => {});
  for (const f of torrent.files) {
    if (!f.wanted || !VIDEO_EXT.test(f.path)) {
      skipped++;
      results.push({ fileIndex: f.fileIndex, path: f.path, status: "skipped", importedPath: null, message: "not wanted or not video" });
      continue;
    }
    // Источник: файл лежит под downloads. qB кладёт по относительному пути торрента;
    // ищем сначала по полному относительному пути, затем по basename (на случай иной структуры).
    const ext = path.extname(f.path);
    const candidates = [path.join(dlRoot, f.path), path.join(dlRoot, path.basename(f.path))];
    let src: string | null = null;
    for (const c of candidates) {
      try { await fs.access(c); src = c; break; } catch { /* нет */ }
    }
    if (!src) {
      skipped++;
      const message = "source file not found";
      results.push({ fileIndex: f.fileIndex, path: f.path, status: "skipped", importedPath: null, message });
      await prisma.mediaTorrentFile.update({ where: { id: f.id }, data: { importError: message } }).catch(() => {});
      continue;
    }

    let destAbs: string;
    if (torrent.contentType === "series" && f.seasonNumber != null && f.episodeNumber != null) {
      const seasonDir = path.join(libRoot, showName, `Season ${pad2(f.seasonNumber)}`);
      await fs.mkdir(seasonDir, { recursive: true });
      destAbs = path.join(seasonDir, `${showName} - S${pad2(f.seasonNumber)}E${pad2(f.episodeNumber)}${ext}`);
    } else if (torrent.contentType === "movie") {
      const movieDir = path.join(libRoot, showName);
      await fs.mkdir(movieDir, { recursive: true });
      destAbs = path.join(movieDir, `${showName}${ext}`);
    } else {
      skipped++;
      const message = "series episode not parsed";
      results.push({ fileIndex: f.fileIndex, path: f.path, status: "skipped", importedPath: null, message });
      await prisma.mediaTorrentFile.update({ where: { id: f.id }, data: { importError: message } }).catch(() => {});
      continue; // сериал без распознанной серии — пропускаем (разложить вручную)
    }

    try {
      await fs.access(destAbs); // уже есть — пропускаем
      skipped++;
      const importedPath = rel(destAbs);
      results.push({ fileIndex: f.fileIndex, path: f.path, status: "skipped", importedPath, message: "already exists" });
      await prisma.mediaTorrentFile.update({ where: { id: f.id }, data: { importedPath, importedAt: new Date(), importError: null } }).catch(() => {});
      continue;
    } catch { /* нет — кладём */ }
    try {
      await fs.link(src, destAbs); // hardlink
    } catch {
      try {
        await fs.copyFile(src, destAbs); // другой том → копия
      } catch (e) {
        failed++;
        const message = String(e);
        results.push({ fileIndex: f.fileIndex, path: f.path, status: "failed", importedPath: null, message });
        await prisma.mediaTorrentFile.update({ where: { id: f.id }, data: { importError: message } }).catch(() => {});
        continue;
      }
    }
    organized++;
    const importedPath = rel(destAbs);
    results.push({ fileIndex: f.fileIndex, path: f.path, status: "imported", importedPath, message: "imported" });
    await prisma.mediaTorrentFile.update({ where: { id: f.id }, data: { importedPath, importedAt: new Date(), importError: null } }).catch(() => {});
  }

  if (organized > 0) await jellyfinRefresh().catch(() => {});
  const importStatus = failed > 0 ? "failed" : organized > 0 ? "imported" : "needs_review";
  await prisma.mediaTorrent.update({
    where: { id: torrent.id },
    data: {
      importStatus,
      importedAt: importStatus === "imported" ? new Date() : null,
      lastError: failed > 0 ? results.find((r) => r.status === "failed")?.message ?? "import failed" : null,
    },
  }).catch(() => {});
  return { organized, skipped, failed, files: results };
}
