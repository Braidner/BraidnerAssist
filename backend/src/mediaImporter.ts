import { config } from "./config.js";
import { log } from "./logger.js";
import { ensureDefaultQualityProfiles } from "./integrations/releaseScore.js";
import { nativeImporterTick } from "./integrations/nativeMedia.js";

export function startMediaImporter(): void {
  ensureDefaultQualityProfiles().catch((e) => log.warn("media", "Не удалось создать профили качества", String(e)));
  setInterval(async () => {
    if (!config.media.qbittorrent.configured) return;
    try {
      await nativeImporterTick();
    } catch (e) {
      log.warn("media", "Ошибка native media importer", String(e));
    }
  }, config.poll.mediaImporter);
}
