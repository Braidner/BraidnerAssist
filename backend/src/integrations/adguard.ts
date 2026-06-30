// Интеграция с AdGuard Home — DNS-статистика (запросы/блокировки/латентность).
// Опционально: ADGUARD_URL/ADGUARD_USER/ADGUARD_PASSWORD не заданы → "Not configured".
// Ошибки изолированы — роут возвращает 502, дашборд не падает.

import { config } from "../config.js";

export interface AdguardTop {
  domain: string;
  count: number;
}

export interface AdguardStats {
  configured: boolean;
  dnsQueries: number;
  blocked: number;
  blockedPercent: number;
  avgProcessingMs: number;
  topBlocked: AdguardTop[];
}

const EMPTY: AdguardStats = {
  configured: false,
  dnsQueries: 0,
  blocked: 0,
  blockedPercent: 0,
  avgProcessingMs: 0,
  topBlocked: [],
};

let cache: { data: AdguardStats; at: number } | null = null;

export function invalidateAdguardCache(): void {
  cache = null;
}

function authHeader(): string {
  const token = Buffer.from(`${config.adguard.username}:${config.adguard.password}`).toString("base64");
  return `Basic ${token}`;
}

interface RawStats {
  num_dns_queries?: number;
  num_blocked_filtering?: number;
  num_replaced_safebrowsing?: number;
  num_replaced_parental?: number;
  avg_processing_time?: number; // секунды
  top_blocked_domains?: Record<string, number>[];
}

export async function getAdguard(): Promise<AdguardStats> {
  if (!config.adguard.configured) return EMPTY;
  if (cache && Date.now() - cache.at < 30_000) return cache.data;

  const res = await fetch(`${config.adguard.url}/control/stats`, {
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`AdGuard responded ${res.status}`);
  const raw = (await res.json()) as RawStats;

  const dnsQueries = raw.num_dns_queries ?? 0;
  const blocked =
    (raw.num_blocked_filtering ?? 0) +
    (raw.num_replaced_safebrowsing ?? 0) +
    (raw.num_replaced_parental ?? 0);
  const blockedPercent = dnsQueries > 0 ? Math.round((blocked / dnsQueries) * 100) : 0;
  const avgProcessingMs = Math.round((raw.avg_processing_time ?? 0) * 1000);

  const topBlocked: AdguardTop[] = (raw.top_blocked_domains ?? [])
    .slice(0, 5)
    .map((o) => {
      const [domain, count] = Object.entries(o)[0] ?? ["", 0];
      return { domain, count };
    });

  const data: AdguardStats = {
    configured: true,
    dnsQueries,
    blocked,
    blockedPercent,
    avgProcessingMs,
    topBlocked,
  };
  cache = { data, at: Date.now() };
  return data;
}

// Включить/выключить защиту AdGuard. duration в мс (0 = бессрочно).
export async function setAdguardProtection(enabled: boolean, durationMs = 0): Promise<void> {
  if (!config.adguard.configured) throw new Error("AdGuard не настроен");
  const res = await fetch(`${config.adguard.url}/control/protection`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, duration: durationMs }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok && res.status !== 204) throw new Error(`AdGuard protection responded ${res.status}`);
  cache = null;
}
