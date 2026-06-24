// TorrServer (YouROK) — мгновенный стриминг торрентов без полной загрузки.
// REST: POST /torrents {action:"add"|"list"|"get"|"rem", link, hash, title, save_to_db};
// стрим GET /stream/{name}?link={hash}&index={fileIndex}&play (отдаёт файл байтами с
// поддержкой Range/seek); health GET /echo. Опционален и изолирован: не настроен → no-op.

import { config } from "../config.js";

const cfg = () => config.media.torrserver;

function tsHeaders(): Record<string, string> {
  const c = cfg();
  if (c.username && c.password) {
    return { Authorization: "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64") };
  }
  return {};
}

export interface TorrFile {
  index: number;
  path: string;
  length: number;
}
export interface TorrInfo {
  hash: string;
  title: string;
  poster: string | null;
  files: TorrFile[];
}

async function tsPost(body: Record<string, unknown>): Promise<any> {
  if (!cfg().configured) throw new Error("TorrServer не настроен");
  const res = await fetch(`${cfg().url}/torrents`, {
    method: "POST",
    headers: { ...tsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`TorrServer ${String(body.action)} ${res.status}`);
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function mapFiles(stats: unknown): TorrFile[] {
  if (!Array.isArray(stats)) return [];
  return stats.map((f: any) => ({
    index: Number(f.id ?? 0),
    path: String(f.path ?? ""),
    length: Number(f.length ?? 0),
  }));
}

// Добавить магнет/torrent-URL, вернуть хеш + список файлов (для выбора видеодорожки).
// add может вернуться раньше, чем TorrServer распарсит метаданные — добираем file_stats
// отдельным get с короткой паузой при пустом ответе.
export async function torrserverAdd(link: string, title?: string): Promise<TorrInfo> {
  const added = await tsPost({ action: "add", link, title, save_to_db: true });
  const hash = String(added.hash ?? "");
  if (!hash) throw new Error("TorrServer не вернул hash");
  let info = added;
  let files = mapFiles(added.file_stats);
  for (let i = 0; i < 5 && files.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 600));
    info = await tsPost({ action: "get", hash });
    files = mapFiles(info.file_stats);
  }
  return {
    hash,
    title: String(info.title ?? added.title ?? title ?? "—"),
    poster: info.poster ?? added.poster ?? null,
    files,
  };
}

// Предпросмотр файлов магнета БЕЗ сохранения (save_to_db:false) — для пофайлового
// выбора серий ДО скачивания. Возвращает hash (== infohash, lowercase hex) + все
// файлы. Метаданные могут прийти не сразу — добираем коротким поллингом.
export async function torrserverFiles(link: string): Promise<TorrInfo> {
  const added = await tsPost({ action: "add", link, save_to_db: false });
  const hash = String(added.hash ?? "");
  if (!hash) throw new Error("TorrServer не вернул hash");
  let info = added;
  let files = mapFiles(added.file_stats);
  for (let i = 0; i < 8 && files.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 700));
    info = await tsPost({ action: "get", hash });
    files = mapFiles(info.file_stats);
  }
  return {
    hash: hash.toLowerCase(),
    title: String(info.title ?? added.title ?? "—"),
    poster: info.poster ?? added.poster ?? null,
    files,
  };
}

// Активные раздачи TorrServer.
export async function torrserverList(): Promise<TorrInfo[]> {
  const list = await tsPost({ action: "list" });
  if (!Array.isArray(list)) return [];
  return list.map((t: any) => ({
    hash: String(t.hash ?? ""),
    title: String(t.title ?? t.name ?? "—"),
    poster: t.poster ?? null,
    files: mapFiles(t.file_stats),
  }));
}

export async function torrserverRemove(hash: string): Promise<void> {
  await tsPost({ action: "rem", hash });
}

export async function torrserverHealth(): Promise<boolean> {
  if (!cfg().configured) return false;
  try {
    const res = await fetch(`${cfg().url}/echo`, { headers: tsHeaders(), signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Реверс-прокси видеопотока с поддержкой Range (seek). Возвращает upstream Response
// (статус 200/206 + content-range/length/type) для пайпинга в Express-ответ.
export async function torrserverStream(hash: string, index: number, range?: string): Promise<Response> {
  if (!cfg().configured) throw new Error("TorrServer не настроен");
  const url = `${cfg().url}/stream/file?link=${encodeURIComponent(hash)}&index=${index}&play`;
  return fetch(url, {
    headers: { ...tsHeaders(), ...(range ? { Range: range } : {}) },
    signal: AbortSignal.timeout(60_000),
  });
}

// Лучший видеофайл пака: крупнейший с видео-расширением.
const VIDEO_RE = /\.(mp4|mkv|avi|m4v|mov|ts|webm)$/i;
export function pickVideoFile(files: TorrFile[]): TorrFile | null {
  const vids = files.filter((f) => VIDEO_RE.test(f.path));
  return vids.sort((a, b) => b.length - a.length)[0] ?? null;
}

// Браузер из коробки тянет только mp4/m4v/webm (h264/aac). mkv/avi/ts → direct-play
// невозможен, нужен внешний плеер/каст.
export function isBrowserPlayable(path: string): boolean {
  return /\.(mp4|m4v|webm)$/i.test(path);
}
