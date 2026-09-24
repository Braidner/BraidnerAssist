// Библиотека локальных LLM-моделей — сканирует директорию LLM_MODELS_DIR
// (структура <root>/<org>/<repo>/, см. homelab/llm-pull.sh и .pultra.json манифест).
// Опционально: LLM_MODELS_DIR не задан → "Not configured", без ошибок.
// Директория без манифеста (руками скопированная модель) тоже поддерживается —
// достаточно, чтобы в ней лежал хотя бы один файл модели (.gguf/.safetensors/.bin/.mlx/.npz).
// Скан лёгкий и дёшевый, но кешируется на ~5с — вкладка может обновляться часто, а
// докачки идут быстро.

import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import * as path from "node:path";
import { config } from "../config.js";

export type LlmFileKind = "model" | "mmproj" | "draft" | "other";

export interface LlmModelFile {
  name: string;
  sizeBytes: number;
  expectedBytes: number | null;
  kind: LlmFileKind;
  quant: string | null;
  complete: boolean;
}

export type LlmModelStatus = "ready" | "downloading" | "stalled" | "error";

export interface LlmModel {
  id: string;
  org: string | null;
  name: string;
  source: "huggingface" | "local";
  url: string | null;
  format: "gguf" | "mlx" | "safetensors" | "other";
  params: string | null;
  tags: string[];
  status: LlmModelStatus;
  error: string | null;
  sizeBytes: number;
  expectedBytes: number | null;
  progressPct: number | null;
  files: LlmModelFile[];
  addedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface LlmModelsData {
  configured: boolean;
  root: string;
  totalBytes: number;
  disk: { totalBytes: number; freeBytes: number } | null;
  models: LlmModel[];
}

const EMPTY: LlmModelsData = {
  configured: false,
  root: "",
  totalBytes: 0,
  disk: null,
  models: [],
};

const MODEL_EXTENSIONS = [".gguf", ".safetensors", ".bin", ".mlx", ".npz"];
const STALE_MS = 5 * 60_000; // 5 минут без активности .part-файла → "stalled"
const CACHE_TTL_MS = 5_000;

const KIND_ORDER: Record<LlmFileKind, number> = { model: 0, mmproj: 1, draft: 2, other: 3 };
const TAG_KEYWORDS = ["uncensored", "abliterated", "heretic", "aggressive", "mtp", "instruct", "coder"] as const;

const QUANT_RE = /\b(IQ\d+(?:_[A-Za-z0-9]+)*|Q\d+(?:_[A-Za-z0-9]+)*|BF16|F16|F32|\d+bit)\b/i;
const PARAMS_RE = /(?<![\d.\w])(\d+(?:\.\d+)?)B(?:-A(\d+(?:\.\d+)?)B)?(?![a-zA-Z])/i;

interface RawManifestFile {
  path: string;
  size: number;
}

interface RawManifest {
  repo?: string;
  source?: string;
  url?: string | null;
  files?: RawManifestFile[];
  status?: string;
  error?: string | null;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

interface DiskFileInfo {
  sizeBytes: number;
  isPart: boolean;
  mtimeMs: number;
}

let cache: { data: LlmModelsData; at: number } | null = null;

export function invalidateLlmModelsCache(): void {
  cache = null;
}

export function fileKind(name: string): LlmFileKind {
  const lower = name.toLowerCase();
  if (lower.startsWith("mmproj")) return "mmproj";
  if (lower.includes("draft")) return "draft";
  if (MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "model";
  return "other";
}

export function parseQuant(name: string): string | null {
  const m = name.match(QUANT_RE);
  if (!m) return null;
  const token = m[0];
  return /^\d+bit$/i.test(token) ? token.toLowerCase() : token.toUpperCase();
}

export function parseParams(name: string): string | null {
  const m = name.match(PARAMS_RE);
  if (!m) return null;
  const base = `${m[1]}B`;
  return m[2] ? `${base}-A${m[2]}B` : base;
}

export function detectTags(id: string, fileNames: string[]): string[] {
  const haystack = `${id} ${fileNames.join(" ")}`.toLowerCase();
  const tags: string[] = [];
  for (const kw of TAG_KEYWORDS) {
    if (haystack.includes(kw)) tags.push(kw);
  }
  if (fileNames.some((n) => fileKind(n) === "mmproj")) tags.push("vision");
  return tags;
}

async function readManifest(dirPath: string): Promise<RawManifest | null> {
  try {
    const raw = await fs.readFile(path.join(dirPath, ".pultra.json"), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RawManifest;
    }
    return null;
  } catch {
    // Отсутствует, повреждён или не JSON — считаем директорию без манифеста.
    return null;
  }
}

async function tryBuildModel(
  dirPath: string,
  id: string,
  org: string | null,
  name: string,
): Promise<LlmModel | null> {
  let dirents: Dirent[];
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const manifest = await readManifest(dirPath);
  const fileDirents = dirents.filter((d) => d.isFile() && !d.name.startsWith("."));

  const diskFiles = new Map<string, DiskFileInfo>();
  const partMtimes: number[] = [];
  for (const f of fileDirents) {
    let st;
    try {
      st = await fs.stat(path.join(dirPath, f.name));
    } catch {
      continue;
    }
    const isPart = f.name.endsWith(".part");
    const finalName = isPart ? f.name.slice(0, -".part".length) : f.name;
    if (isPart) partMtimes.push(st.mtimeMs);
    const existing = diskFiles.get(finalName);
    // Финальный (докачанный) файл важнее незавершённого .part с тем же именем.
    if (!existing || (existing.isPart && !isPart)) {
      diskFiles.set(finalName, { sizeBytes: st.size, isPart, mtimeMs: st.mtimeMs });
    }
  }

  const hasModelExt = [...diskFiles.keys()].some((n) =>
    MODEL_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)),
  );
  if (!manifest && !hasModelExt) return null;

  const manifestFiles = Array.isArray(manifest?.files)
    ? manifest!.files!.filter((f): f is RawManifestFile => Boolean(f) && typeof f.path === "string")
    : [];
  const manifestNames = manifestFiles.map((f) => f.path);
  const manifestSet = new Set(manifestNames);
  const extraNames = [...diskFiles.keys()].filter((n) => !manifestSet.has(n));
  extraNames.sort((a, b) => KIND_ORDER[fileKind(a)] - KIND_ORDER[fileKind(b)] || a.localeCompare(b));
  const orderedNames = [...manifestNames, ...extraNames];

  const files: LlmModelFile[] = orderedNames.map((fname) => {
    const disk = diskFiles.get(fname);
    const expectedEntry = manifestFiles.find((f) => f.path === fname);
    const expectedBytes =
      expectedEntry && Number.isFinite(expectedEntry.size) ? expectedEntry.size : null;
    const sizeBytes = disk?.sizeBytes ?? 0;
    const complete = Boolean(disk && !disk.isPart && (expectedBytes == null || sizeBytes >= expectedBytes));
    return {
      name: fname,
      sizeBytes,
      expectedBytes,
      kind: fileKind(fname),
      quant: parseQuant(fname),
      complete,
    };
  });

  const sizeBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
  const expectedBytes = manifest
    ? manifestFiles.reduce((s, f) => s + (Number.isFinite(f.size) ? f.size : 0), 0)
    : null;
  const progressPct =
    expectedBytes != null && expectedBytes > 0
      ? Math.min(100, Math.round((sizeBytes / expectedBytes) * 1000) / 10)
      : null;

  let dirStat;
  try {
    dirStat = await fs.stat(dirPath);
  } catch {
    dirStat = null;
  }
  const newestFileMtime = diskFiles.size > 0 ? Math.max(...[...diskFiles.values()].map((v) => v.mtimeMs)) : null;

  const addedAt =
    manifest?.startedAt ?? (dirStat ? new Date(dirStat.birthtimeMs || dirStat.mtimeMs).toISOString() : null);
  const updatedAt =
    manifest?.updatedAt ??
    (newestFileMtime != null ? new Date(newestFileMtime).toISOString() : dirStat ? new Date(dirStat.mtimeMs).toISOString() : null);
  const completedAt = manifest?.completedAt ?? null;

  const incomplete = files.some((f) => !f.complete);
  let status: LlmModelStatus;
  if (manifest?.status === "error") {
    status = "error";
  } else if (!incomplete) {
    status = "ready";
  } else {
    const freshPart = partMtimes.length > 0 && Date.now() - Math.max(...partMtimes) < STALE_MS;
    status = freshPart ? "downloading" : "stalled";
  }

  const hasGguf = files.some((f) => f.name.toLowerCase().endsWith(".gguf"));
  const hasSafetensors = files.some((f) => f.name.toLowerCase().endsWith(".safetensors"));
  const format: LlmModel["format"] = hasGguf
    ? "gguf"
    : name.toLowerCase().includes("mlx")
      ? "mlx"
      : hasSafetensors
        ? "safetensors"
        : "other";

  return {
    id,
    org,
    name,
    source: manifest ? "huggingface" : "local",
    url: manifest?.url ?? null,
    format,
    params: parseParams(name),
    tags: detectTags(id, files.map((f) => f.name)),
    status,
    error: manifest?.error ?? null,
    sizeBytes,
    expectedBytes,
    progressPct,
    files,
    addedAt,
    completedAt,
    updatedAt,
  };
}

async function scanModels(root: string): Promise<LlmModel[]> {
  const out: LlmModel[] = [];
  let depth1: Dirent[];
  try {
    depth1 = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const d1 of depth1) {
    if (!d1.isDirectory() || d1.name.startsWith(".")) continue;
    const d1Path = path.join(root, d1.name);

    // Депт 1: модель без org (напр. руками скопированная, без манифеста).
    const asModel = await tryBuildModel(d1Path, d1.name, null, d1.name);
    if (asModel) {
      out.push(asModel);
      continue;
    }

    // Депт 2: <org>/<repo> — стандартный вывод llm-pull.sh.
    let depth2: Dirent[];
    try {
      depth2 = await fs.readdir(d1Path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d2 of depth2) {
      if (!d2.isDirectory() || d2.name.startsWith(".")) continue;
      const d2Path = path.join(d1Path, d2.name);
      const model = await tryBuildModel(d2Path, `${d1.name}/${d2.name}`, d1.name, d2.name);
      if (model) out.push(model);
    }
  }

  return out;
}

function sortModels(models: LlmModel[]): LlmModel[] {
  const rank = (s: LlmModelStatus) => (s === "ready" ? 1 : 0);
  return [...models].sort((a, b) => {
    const ra = rank(a.status);
    const rb = rank(b.status);
    if (ra !== rb) return ra - rb;
    const ta = a.addedAt ? Date.parse(a.addedAt) : 0;
    const tb = b.addedAt ? Date.parse(b.addedAt) : 0;
    return tb - ta;
  });
}

async function getDiskInfo(root: string): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const st = await fs.statfs(root);
    return {
      totalBytes: st.blocks * st.bsize,
      freeBytes: st.bavail * st.bsize,
    };
  } catch {
    return null;
  }
}

export async function getLlmModels(): Promise<LlmModelsData> {
  if (!config.llm.configured) return EMPTY;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const root = config.llm.modelsDir as string;

  let rootExists = true;
  try {
    await fs.stat(root);
  } catch {
    rootExists = false;
  }

  if (!rootExists) {
    const data: LlmModelsData = { configured: true, root, totalBytes: 0, disk: null, models: [] };
    cache = { data, at: Date.now() };
    return data;
  }

  const models = sortModels(await scanModels(root));
  const totalBytes = models.reduce((s, m) => s + m.sizeBytes, 0);
  const disk = await getDiskInfo(root);

  const data: LlmModelsData = { configured: true, root, totalBytes, disk, models };
  cache = { data, at: Date.now() };
  return data;
}
