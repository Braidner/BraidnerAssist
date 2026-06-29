// Media filesystem browser.
// ВСЕ операции жёстко заперты в MEDIA_ROOT (анти-traversal): list/mkdir/rename/move/
// delete. Torrent importing/organizing intentionally lives outside this module.

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

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
