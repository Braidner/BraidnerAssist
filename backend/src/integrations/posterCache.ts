import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Response } from "express";
import { config } from "../config.js";

export type PosterCacheSource = "tmdb" | "tvdb" | "kinozal" | "jellyfin";

export type PosterCacheDescriptor = {
  source: PosterCacheSource;
  keyParts: unknown;
  originalUrl?: string;
  itemId?: string;
  ttlMs: number;
};

type PosterCacheMeta = {
  key: string;
  source: PosterCacheSource;
  contentType: string;
  extension: string;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
  sizeBytes: number;
  originalUrl?: string;
  itemId?: string;
};

type CacheEntry = {
  key: string;
  source: PosterCacheSource;
  imagePath: string;
  metaPath: string;
  meta: PosterCacheMeta;
  fresh: boolean;
};

type PosterCacheStats = {
  configured: true;
  dir: string;
  maxBytes: number;
  sizeBytes: number;
  files: number;
  sources: Record<string, { files: number; sizeBytes: number }>;
};

const inFlightRefresh = new Set<string>();
let lastCleanupAt = 0;
let cleanupTimer: NodeJS.Timeout | null = null;
let cleanupRunning = false;

function cacheKey(desc: PosterCacheDescriptor): string {
  return createHash("sha256")
    .update(JSON.stringify({ source: desc.source, keyParts: desc.keyParts }))
    .digest("hex");
}

function extFromContentType(contentType: string): string {
  const clean = contentType.split(";")[0]?.trim().toLowerCase();
  if (clean === "image/png") return "png";
  if (clean === "image/webp") return "webp";
  if (clean === "image/gif") return "gif";
  if (clean === "image/avif") return "avif";
  return "jpg";
}

function pathsFor(desc: PosterCacheDescriptor, key = cacheKey(desc), ext = "jpg") {
  const prefix = key.slice(0, 2);
  const dir = path.join(config.posterCache.dir, desc.source, prefix);
  return {
    key,
    dir,
    imagePath: path.join(dir, `${key}.${ext}`),
    metaPath: path.join(dir, `${key}.json`),
  };
}

async function readMeta(metaPath: string): Promise<PosterCacheMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath, "utf8")) as PosterCacheMeta;
  } catch {
    return null;
  }
}

async function removeEntryFiles(entry: { imagePath?: string; metaPath?: string }) {
  await Promise.all([
    entry.imagePath ? rm(entry.imagePath, { force: true }) : Promise.resolve(),
    entry.metaPath ? rm(entry.metaPath, { force: true }) : Promise.resolve(),
  ]);
}

async function touchMeta(entry: CacheEntry) {
  const updated = { ...entry.meta, lastAccessedAt: new Date().toISOString() };
  await writeFile(entry.metaPath, JSON.stringify(updated, null, 2));
}

export async function getPosterCacheEntry(desc: PosterCacheDescriptor): Promise<CacheEntry | null> {
  const { key, metaPath } = pathsFor(desc);
  const meta = await readMeta(metaPath);
  if (!meta) return null;

  const imagePath = path.join(path.dirname(metaPath), `${key}.${meta.extension}`);
  try {
    const s = await stat(imagePath);
    if (!s.isFile()) throw new Error("not a file");
  } catch {
    await removeEntryFiles({ imagePath, metaPath });
    return null;
  }

  return {
    key,
    source: desc.source,
    imagePath,
    metaPath,
    meta,
    fresh: new Date(meta.expiresAt).getTime() > Date.now(),
  };
}

export async function savePosterCache(desc: PosterCacheDescriptor, contentType: string, body: Buffer): Promise<CacheEntry | null> {
  if (!contentType.toLowerCase().startsWith("image/")) return null;
  if (body.length > config.posterCache.objectMaxBytes) return null;

  const extension = extFromContentType(contentType);
  const { key, dir, imagePath, metaPath } = pathsFor(desc, undefined, extension);
  await mkdir(dir, { recursive: true });

  const now = new Date();
  const meta: PosterCacheMeta = {
    key,
    source: desc.source,
    contentType,
    extension,
    createdAt: now.toISOString(),
    lastAccessedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + desc.ttlMs).toISOString(),
    sizeBytes: body.length,
    originalUrl: desc.originalUrl,
    itemId: desc.itemId,
  };

  const tmpBase = path.join(dir, `${key}.${randomUUID()}.tmp`);
  const tmpImage = `${tmpBase}.${extension}`;
  const tmpMeta = `${tmpBase}.json`;

  await writeFile(tmpImage, body);
  await writeFile(tmpMeta, JSON.stringify(meta, null, 2));
  await rename(tmpImage, imagePath);
  await rename(tmpMeta, metaPath);
  schedulePosterCacheCleanup();

  return { key, source: desc.source, imagePath, metaPath, meta, fresh: true };
}

export function sendCachedPoster(res: Response, entry: CacheEntry, cacheState: "HIT" | "STALE") {
  res.setHeader("Content-Type", entry.meta.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("X-Poster-Cache", cacheState);
  void touchMeta(entry).catch(() => undefined);
  createReadStream(entry.imagePath).pipe(res);
}

export async function fetchAndStorePoster(
  desc: PosterCacheDescriptor,
  fetcher: () => Promise<globalThis.Response>,
): Promise<{ upstream: globalThis.Response; body?: Buffer; entry?: CacheEntry | null }> {
  const upstream = await fetcher();
  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const length = Number(upstream.headers.get("content-length") ?? NaN);
  if (!upstream.ok || !upstream.body || !contentType.toLowerCase().startsWith("image/")) {
    return { upstream };
  }
  if (Number.isFinite(length) && length > config.posterCache.objectMaxBytes) {
    return { upstream };
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  const entry = await savePosterCache(desc, contentType, body);
  return { upstream, body, entry };
}

export function refreshPosterCacheInBackground(
  desc: PosterCacheDescriptor,
  fetcher: () => Promise<globalThis.Response>,
) {
  const key = cacheKey(desc);
  if (inFlightRefresh.has(key)) return;
  inFlightRefresh.add(key);
  void fetchAndStorePoster(desc, fetcher)
    .catch(() => undefined)
    .finally(() => {
      inFlightRefresh.delete(key);
    });
}

async function walkCacheFiles(dir: string): Promise<Array<{ imagePath: string; metaPath: string; meta: PosterCacheMeta }>> {
  const entries: Array<{ imagePath: string; metaPath: string; meta: PosterCacheMeta }> = [];
  let sourceDirs: string[];
  try {
    sourceDirs = await readdir(dir);
  } catch {
    return entries;
  }

  for (const source of sourceDirs) {
    const sourcePath = path.join(dir, source);
    let buckets: string[];
    try {
      buckets = await readdir(sourcePath);
    } catch {
      continue;
    }
    for (const bucket of buckets) {
      const bucketPath = path.join(sourcePath, bucket);
      let files: string[];
      try {
        files = await readdir(bucketPath);
      } catch {
        continue;
      }
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        const metaPath = path.join(bucketPath, file);
        const meta = await readMeta(metaPath);
        if (!meta?.key || !meta.extension) {
          await rm(metaPath, { force: true });
          continue;
        }
        const imagePath = path.join(bucketPath, `${meta.key}.${meta.extension}`);
        try {
          const s = await stat(imagePath);
          if (!s.isFile()) throw new Error("missing image");
          if (meta.sizeBytes !== s.size) {
            meta.sizeBytes = s.size;
          }
          entries.push({ imagePath, metaPath, meta });
        } catch {
          await removeEntryFiles({ imagePath, metaPath });
        }
      }
    }
  }
  return entries;
}

export async function getPosterCacheStatus(): Promise<PosterCacheStats> {
  const entries = await walkCacheFiles(config.posterCache.dir);
  const sources: Record<string, { files: number; sizeBytes: number }> = {};
  let sizeBytes = 0;
  for (const entry of entries) {
    sizeBytes += entry.meta.sizeBytes;
    sources[entry.meta.source] ??= { files: 0, sizeBytes: 0 };
    sources[entry.meta.source].files += 1;
    sources[entry.meta.source].sizeBytes += entry.meta.sizeBytes;
  }
  return {
    configured: true,
    dir: config.posterCache.dir,
    maxBytes: config.posterCache.maxBytes,
    sizeBytes,
    files: entries.length,
    sources,
  };
}

export async function clearPosterCache(): Promise<{ ok: true; deletedFiles: number; deletedBytes: number }> {
  const before = await getPosterCacheStatus();
  await rm(config.posterCache.dir, { recursive: true, force: true });
  await mkdir(config.posterCache.dir, { recursive: true });
  return { ok: true, deletedFiles: before.files, deletedBytes: before.sizeBytes };
}

export async function cleanupPosterCache(): Promise<void> {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const entries = await walkCacheFiles(config.posterCache.dir);
    let sizeBytes = entries.reduce((sum, entry) => sum + entry.meta.sizeBytes, 0);
    if (sizeBytes <= config.posterCache.maxBytes) return;

    const sorted = entries.sort(
      (a, b) => new Date(a.meta.lastAccessedAt).getTime() - new Date(b.meta.lastAccessedAt).getTime(),
    );
    for (const entry of sorted) {
      if (sizeBytes <= config.posterCache.maxBytes) break;
      sizeBytes -= entry.meta.sizeBytes;
      await removeEntryFiles(entry);
    }
  } finally {
    cleanupRunning = false;
    lastCleanupAt = Date.now();
  }
}

export function schedulePosterCacheCleanup() {
  const interval = config.posterCache.cleanupIntervalMs;
  if (Date.now() - lastCleanupAt < interval) return;
  if (cleanupTimer) return;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    void cleanupPosterCache().catch(() => undefined);
  }, 1_000);
  cleanupTimer.unref?.();
}

export function startPosterCacheCleanup() {
  const interval = config.posterCache.cleanupIntervalMs;
  if (interval <= 0) return;
  const timer = setInterval(() => {
    void cleanupPosterCache().catch(() => undefined);
  }, interval);
  timer.unref?.();
}
