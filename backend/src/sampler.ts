// Сэмплер аптайма сервисов: каждые POLL_SERVICES мс пишет строку ServiceCheck в SQLite,
// старые строки (>7 дней) удаляет. Запускается из index.ts после app.listen.

import { prisma } from "./db/client.js";
import { config } from "./config.js";
import { getServices } from "./integrations/services.js";
import { log } from "./logger.js";

let samplerTimer: NodeJS.Timeout | null = null;

export function startSampler(): void {
  if (samplerTimer) clearInterval(samplerTimer);
  samplerTimer = setInterval(async () => {
    try {
      const result = await getServices();
      if (!result.configured) return;

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      await prisma.serviceCheck.createMany({
        data: result.services.map((s) => ({
          name: s.name,
          status: s.status,
          latencyMs: s.latencyMs ?? null,
          createdAt: now,
        })),
      });

      await prisma.serviceCheck.deleteMany({
        where: { createdAt: { lt: weekAgo } },
      });
    } catch (err) {
      log.warn("sampler", "Ошибка сэмплера аптайма", String(err));
    }
  }, config.poll.services);
  samplerTimer.unref?.();
}

export function restartSampler(): void {
  startSampler();
}
