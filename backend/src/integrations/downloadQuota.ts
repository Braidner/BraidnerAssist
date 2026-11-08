import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1_000;

export type DownloadQuotaPeriodKey = "absolute" | "daily" | "weekly";

export interface DownloadQuotaPeriod {
  key: DownloadQuotaPeriodKey;
  label: string;
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  resetsAt: string | null;
}

export interface DownloadQuotaSnapshot {
  configured: boolean;
  userId: string | null;
  periods: DownloadQuotaPeriod[];
  available: number | null;
  blockingPeriod: DownloadQuotaPeriodKey | null;
  updatedAt: string;
}

export interface DownloadQuotaSource {
  id: string;
  downloadLimitTotal: number | null;
  downloadLimitDaily: number | null;
  downloadLimitWeekly: number | null;
  downloadTotalResetAt: Date | null;
  downloadDailyResetAt: Date | null;
  downloadWeeklyResetAt: Date | null;
  downloads: Array<{ addedAt: Date }>;
}

export class DownloadQuotaExceededError extends Error {
  readonly code = "DOWNLOAD_QUOTA_EXCEEDED";

  constructor(readonly period: DownloadQuotaPeriod) {
    super(`Лимит загрузок исчерпан: ${period.label.toLowerCase()} ${period.used} из ${period.limit}`);
  }
}

function shiftedMoscowDate(now: Date): Date {
  return new Date(now.getTime() + MOSCOW_OFFSET_MS);
}

export function startOfMoscowDay(now: Date): Date {
  const shifted = shiftedMoscowDate(now);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      MOSCOW_OFFSET_MS,
  );
}

export function nextMoscowMidnight(now: Date): Date {
  const shifted = shiftedMoscowDate(now);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + 1,
    ) - MOSCOW_OFFSET_MS,
  );
}

export function startOfMoscowWeek(now: Date): Date {
  const shifted = shiftedMoscowDate(now);
  const mondayOffset = (shifted.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - mondayOffset,
    ) - MOSCOW_OFFSET_MS,
  );
}

export function nextMoscowWeek(now: Date): Date {
  return new Date(startOfMoscowWeek(now).getTime() + 7 * 24 * 60 * 60 * 1_000);
}

function laterDate(a: Date, b: Date | null): Date {
  return b && b.getTime() > a.getTime() ? b : a;
}

function quotaPeriod(
  key: DownloadQuotaPeriodKey,
  label: string,
  limit: number | null,
  used: number,
  resetsAt: Date | null,
): DownloadQuotaPeriod | null {
  if (limit == null || limit <= 0) return null;
  const normalizedUsed = Math.max(0, used);
  return {
    key,
    label,
    limit,
    used: normalizedUsed,
    remaining: Math.max(0, limit - normalizedUsed),
    percent: Math.max(0, Math.min(100, Math.round((normalizedUsed / limit) * 100))),
    resetsAt: resetsAt?.toISOString() ?? null,
  };
}

export function buildDownloadQuotaSnapshot(
  source: DownloadQuotaSource | null,
  now = new Date(),
): DownloadQuotaSnapshot {
  if (!source) {
    return {
      configured: false,
      userId: null,
      periods: [],
      available: null,
      blockingPeriod: null,
      updatedAt: now.toISOString(),
    };
  }

  const absoluteBoundary = source.downloadTotalResetAt;
  const dailyBoundary = laterDate(startOfMoscowDay(now), source.downloadDailyResetAt);
  const weeklyBoundary = laterDate(startOfMoscowWeek(now), source.downloadWeeklyResetAt);
  const countSince = (boundary: Date | null) =>
    (source.downloads ?? []).filter(
      (download) => !boundary || download.addedAt.getTime() >= boundary.getTime(),
    ).length;

  const periods = [
    quotaPeriod(
      "absolute",
      "Абсолютный лимит",
      source.downloadLimitTotal,
      countSince(absoluteBoundary),
      null,
    ),
    quotaPeriod(
      "daily",
      "Сегодня",
      source.downloadLimitDaily,
      countSince(dailyBoundary),
      nextMoscowMidnight(now),
    ),
    quotaPeriod(
      "weekly",
      "Эта неделя",
      source.downloadLimitWeekly,
      countSince(weeklyBoundary),
      nextMoscowWeek(now),
    ),
  ].filter((period): period is DownloadQuotaPeriod => Boolean(period));

  const blocking = periods.find((period) => period.remaining === 0) ?? null;
  return {
    configured: periods.length > 0,
    userId: source.id,
    periods,
    available: periods.length
      ? Math.min(...periods.map((period) => period.remaining))
      : null,
    blockingPeriod: blocking?.key ?? null,
    updatedAt: now.toISOString(),
  };
}

async function quotaSource(userId: string, db: Prisma.TransactionClient = prisma): Promise<DownloadQuotaSource | null> {
  return db.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      downloadLimitTotal: true,
      downloadLimitDaily: true,
      downloadLimitWeekly: true,
      downloadTotalResetAt: true,
      downloadDailyResetAt: true,
      downloadWeeklyResetAt: true,
      downloads: { select: { addedAt: true } },
    },
  });
}

function isQuotaUser(userId: string | null | undefined): userId is string {
  return Boolean(userId && userId !== "app-token");
}

// Legacy movie/manual grabs perform a qB network call between the quota check
// and the accounting write. Serialize grabs per account across both media sections.
const pendingGrabs = new Map<string, Promise<void>>();

export async function withUserDownloadLock<T>(userId: string | null, action: () => Promise<T>): Promise<T> {
  if (!isQuotaUser(userId)) return action();
  const previous = pendingGrabs.get(userId) ?? Promise.resolve();
  const work = previous.then(action);
  const tail = work.then(() => {}, () => {});
  pendingGrabs.set(userId, tail);
  try { return await work; }
  finally { if (pendingGrabs.get(userId) === tail) pendingGrabs.delete(userId); }
}

export async function getUserDownloadQuota(
  userId: string | null | undefined,
  now = new Date(),
): Promise<DownloadQuotaSnapshot> {
  if (!isQuotaUser(userId)) return buildDownloadQuotaSnapshot(null, now);
  return buildDownloadQuotaSnapshot(await quotaSource(userId), now);
}

export async function assertUserCanDownload(
  userId: string | null | undefined,
  infohash?: string | null,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  if (!isQuotaUser(userId)) return;
  const normalizedHash = infohash?.trim().toLowerCase();
  if (
    normalizedHash &&
    (await db.userDownload.findUnique({
      where: { infohash: normalizedHash },
      select: { id: true },
    }))
  ) {
    return;
  }
  const quota = buildDownloadQuotaSnapshot(await quotaSource(userId, db));
  const blocking = quota.periods.find((period) => period.remaining === 0);
  if (blocking) throw new DownloadQuotaExceededError(blocking);
}

export async function recordUserDownload(input: {
  userId: string | null | undefined;
  infohash: string;
  releaseTitle?: string | null;
  size?: number | null;
}, db: Prisma.TransactionClient = prisma): Promise<void> {
  if (!isQuotaUser(input.userId)) return;
  const infohash = input.infohash.trim().toLowerCase();
  if (!infohash) return;
  await db.userDownload.upsert({
    where: { infohash },
    create: {
      appUserId: input.userId,
      infohash,
      releaseTitle: input.releaseTitle?.trim() || null,
      size: input.size ?? null,
    },
    update: {},
  });
}

export async function releaseUserDownload(infohash: string, db: Prisma.TransactionClient = prisma): Promise<void> {
  await db.userDownload.deleteMany({
    where: { infohash: infohash.trim().toLowerCase() },
  });
}

function normalizeLimit(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 10_000) {
    throw new Error("Лимит должен быть целым числом от 1 до 10000");
  }
  return parsed;
}

export async function updateUserDownloadLimits(
  userId: string,
  input: { absolute?: unknown; daily?: unknown; weekly?: unknown },
): Promise<DownloadQuotaSnapshot> {
  await prisma.appUser.update({
    where: { id: userId },
    data: {
      downloadLimitTotal: normalizeLimit(input.absolute),
      downloadLimitDaily: normalizeLimit(input.daily),
      downloadLimitWeekly: normalizeLimit(input.weekly),
    },
  });
  return getUserDownloadQuota(userId);
}

export async function resetUserDownloadQuota(
  userId: string,
  period: DownloadQuotaPeriodKey,
  now = new Date(),
): Promise<DownloadQuotaSnapshot> {
  const field = {
    absolute: "downloadTotalResetAt",
    daily: "downloadDailyResetAt",
    weekly: "downloadWeeklyResetAt",
  }[period];
  await prisma.appUser.update({
    where: { id: userId },
    data: { [field]: now },
  });
  return getUserDownloadQuota(userId, now);
}
