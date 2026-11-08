// Media filesystem browser.
// ВСЕ операции жёстко заперты в MEDIA_ROOT (анти-traversal): list/mkdir/rename/move/
// delete. Torrent importing/organizing intentionally lives outside this module.

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const root = () => config.mediaFs.root!;
const musicRoot = () => path.resolve(root(), config.mediaFs.music);
const within = (parent: string, candidate: string) => candidate === parent || candidate.startsWith(parent + path.sep);

// Преобразовать относительный путь → абсолютный ВНУТРИ корня. Бросает при выходе
// за пределы (../, абсолютные пути, нулевые байты). Лексическая проверка.
async function safe(rel: string, wholeSubtree = false): Promise<string> {
  if (!config.mediaFs.configured) throw new Error("MEDIA_ROOT не настроен");
  const clean = String(rel ?? "").replace(/\0/g, "").replace(/^[/\\]+/, "");
  const base = path.resolve(root());
  const abs = path.resolve(base, clean);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error("Путь вне медиатеки");
  }
  const music = musicRoot();
  if (within(music, abs) || (wholeSubtree && within(abs, music))) throw new Error("Музыкальная папка недоступна");
  // The UI already omits symlinks. Also reject them in explicitly supplied paths,
  // including existing components of a new destination created with recursive mkdir.
  let cursor = base;
  for (const part of path.relative(base, abs).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error("Переход по симлинку недоступен");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
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

async function dirSize(abs: string): Promise<number> {
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const d of dirents) {
    if (d.name.startsWith(".") || d.isSymbolicLink()) continue;
    const childAbs = path.join(abs, d.name);
    if (within(musicRoot(), childAbs)) continue;
    try {
      const st = await fs.lstat(childAbs);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) total += await dirSize(childAbs);
      else if (st.isFile()) total += st.size;
    } catch {
      // Ignore files that vanish or cannot be read while the listing is built.
    }
  }
  return total;
}

// Список содержимого папки (по умолчанию — корень).
export async function listDir(relPath = ""): Promise<{ path: string; entries: FileEntry[] }> {
  const abs = await safe(relPath);
  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const entries: FileEntry[] = [];
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue; // скрытые/системные не показываем
    const childAbs = path.join(abs, d.name);
    if (within(musicRoot(), childAbs)) continue;
    let size = 0;
    let mtime = 0;
    try {
      const st = await fs.lstat(childAbs);
      if (st.isSymbolicLink()) continue;
      mtime = st.mtimeMs;
      size = st.isDirectory() ? await dirSize(childAbs) : st.size;
    } catch {
      continue; // битые симлинки и т.п.
    }
    const isDir = d.isDirectory();
    entries.push({
      name: d.name,
      path: rel(childAbs),
      type: isDir ? "dir" : "file",
      size,
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
  const abs = await safe(path.join(parentRel, name));
  await fs.mkdir(abs, { recursive: true });
}

export async function renameEntry(targetRel: string, newName: string): Promise<void> {
  if (!newName.trim() || /[/\\]/.test(newName)) throw new Error("Недопустимое имя");
  const abs = await safe(targetRel, true);
  const dest = await safe(path.join(path.dirname(targetRel), newName), true);
  await fs.rename(abs, dest);
}

export async function moveEntry(srcRel: string, destDirRel: string): Promise<void> {
  const src = await safe(srcRel, true);
  const dest = await safe(path.join(destDirRel, path.basename(src)), true);
  const destDir = path.dirname(dest);
  await fs.mkdir(destDir, { recursive: true });
  await fs.rename(src, dest);
}

export async function removeEntry(targetRel: string): Promise<void> {
  const abs = await safe(targetRel, true);
  if (abs === path.resolve(root())) throw new Error("Нельзя удалить корень");
  await fs.rm(abs, { recursive: true, force: true });
}
