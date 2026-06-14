import { readFile, writeFile } from "fs/promises";
import { config } from "../config.js";

export interface ServiceConfig {
  name: string;
  url: string;
}

export interface ServiceResult {
  name: string;
  status: "ok" | "warn" | "bad";
  tag: string;
  latencyMs: number | null;
}

let cache: { data: ServiceResult[]; at: number } | null = null;

async function checkService(svc: ServiceConfig): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const res = await fetch(svc.url, { signal: AbortSignal.timeout(5_000) });
    const latency = Date.now() - start;
    return {
      name: svc.name,
      status: res.ok ? "ok" : "warn",
      tag: `${latency}ms`,
      latencyMs: latency,
    };
  } catch {
    return { name: svc.name, status: "bad", tag: "timeout", latencyMs: null };
  }
}

export async function getServices(): Promise<{
  configured: boolean;
  services: ServiceResult[];
}> {
  if (cache && Date.now() - cache.at < config.poll.services) {
    return { configured: true, services: cache.data };
  }

  let configs: ServiceConfig[];
  try {
    const raw = await readFile(config.servicesFile, "utf-8");
    configs = JSON.parse(raw) as ServiceConfig[];
  } catch {
    // No file → not configured; return stale cache if available
    return cache
      ? { configured: true, services: cache.data }
      : { configured: false, services: [] };
  }

  const results = await Promise.allSettled(configs.map(checkService));
  const services = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { name: "unknown", status: "bad" as const, tag: "error", latencyMs: null },
  );

  cache = { data: services, at: Date.now() };
  return { configured: true, services };
}

export function invalidateServicesCache(): void {
  cache = null;
}

export async function readServicesConfig(): Promise<ServiceConfig[]> {
  try {
    const raw = await readFile(config.servicesFile, "utf-8");
    return JSON.parse(raw) as ServiceConfig[];
  } catch {
    return [];
  }
}

export async function writeServicesConfig(configs: ServiceConfig[]): Promise<void> {
  for (const svc of configs) {
    if (!svc.name?.trim()) throw new Error("Service name cannot be empty");
    new URL(svc.url); // throws if invalid
  }
  await writeFile(config.servicesFile, JSON.stringify(configs, null, 2), "utf-8");
}
