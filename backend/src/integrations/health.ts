import { prisma } from "../db/client.js";

export interface HealthSummary {
  configured: boolean;
  today: { steps: number; km: number } | null;
  week: Array<{ date: string; steps: number; km: number }>;
}

let cache: { data: HealthSummary; at: number } | null = null;
const CACHE_TTL = 60_000;

function localDateStr(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA").format(d);
}

export async function pushDay(date: string, steps: number, km: number): Promise<void> {
  await prisma.healthDay.upsert({
    where: { date },
    update: { steps, km },
    create: { date, steps, km },
  });
  cache = null;
}

export async function getHealthSummary(): Promise<HealthSummary> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.data;

  const todayStr = localDateStr();
  const from = localDateStr(new Date(Date.now() - 6 * 86_400_000));

  const rows = await prisma.healthDay.findMany({
    where: { date: { gte: from } },
    orderBy: { date: "desc" },
    take: 7,
  });

  const todayRow = rows.find((r) => r.date === todayStr);
  const data: HealthSummary = {
    configured: rows.length > 0,
    today: todayRow ? { steps: todayRow.steps, km: todayRow.km } : null,
    week: rows.map((r) => ({ date: r.date, steps: r.steps, km: r.km })),
  };

  cache = { data, at: Date.now() };
  return data;
}
