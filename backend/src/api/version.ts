import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

export const versionRouter = Router();

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "../../package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

let latestCache: { data: string | null; at: number } | null = null;
const CACHE_TTL = 3_600_000; // 1 hour

async function fetchLatest(): Promise<string | null> {
  if (latestCache && Date.now() - latestCache.at < CACHE_TTL) return latestCache.data;
  try {
    const res = await fetch(
      "https://api.github.com/repos/Braidner/BraidnerAssist/releases/latest",
      { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) { latestCache = { data: null, at: Date.now() }; return null; }
    const data = (await res.json()) as { tag_name?: string };
    const latest = data.tag_name?.replace(/^v/, "") ?? null;
    latestCache = { data: latest, at: Date.now() };
    return latest;
  } catch {
    latestCache = { data: null, at: Date.now() };
    return null;
  }
}

versionRouter.get("/", async (_req, res) => {
  const latest = await fetchLatest();
  res.json({ version, latest, hasUpdate: latest !== null && latest !== version });
});
