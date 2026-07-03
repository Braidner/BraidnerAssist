// Прокси постеров. Браузер бьётся только в LAN-origin дашборда, а картинку тащит
// бэкенд: TMDB по IPv4 (у клиента часто нет IPv6-egress до BunnyCDN → таймаут) и
// Jellyfin с инжектом токена (<img> не может слать bearer). Маршрут вынесен из-под
// jwtAuth (постеры — публичная афиша, не секрет; LAN-only), но жёстко ограничен по
// источнику (анти-SSRF): только image.tmdb.org, artworks.thetvdb.com,
// kinozal.tv/i/poster и собственный Jellyfin по id.

import { Router } from "express";
import { Readable } from "node:stream";
import { config } from "../config.js";
import {
  fetchAndStorePoster,
  getPosterCacheEntry,
  refreshPosterCacheInBackground,
  sendCachedPoster,
  type PosterCacheDescriptor,
  type PosterCacheSource,
} from "../integrations/posterCache.js";
import { log, errorDetail } from "../logger.js";

export const posterRouter = Router();

function remoteSource(url: string): PosterCacheSource | null {
  if (/^https:\/\/image\.tmdb\.org\//.test(url)) return "tmdb";
  if (/^https:\/\/artworks\.thetvdb\.com\//.test(url)) return "tvdb";
  if (/^https:\/\/kinozal\.tv\/i\/poster\/[\w/-]+\.(?:jpe?g|png|webp)(?:\?.*)?$/i.test(url)) return "kinozal";
  return null;
}

function sourceTtlMs(source: PosterCacheSource): number {
  if (source === "tmdb") return config.posterCache.tmdbTtlMs;
  if (source === "tvdb") return config.posterCache.tvdbTtlMs;
  if (source === "kinozal") return config.posterCache.kinozalTtlMs;
  return config.posterCache.jellyfinTtlMs;
}

posterRouter.get("/", async (req, res) => {
  const tmdb = typeof req.query.url === "string" ? req.query.url : "";
  const jf = typeof req.query.jf === "string" ? req.query.jf : "";

  try {
    let desc: PosterCacheDescriptor;
    let fetcher: () => Promise<globalThis.Response>;

    if (tmdb) {
      // SSRF-guard: разрешены только источники афиш native media — TMDB и
      // TheTVDB. Прочее режем. Тащим как есть (full-size): прежний
      // даунсайз до w92 был обходом сломанного Path-MTU на egress хоста (oversized
      // пакеты BunnyCDN чёрнодырились после ~16КБ); после смены egress-маршрута баг
      // ушёл — full-size грузится мгновенно (TMDB original ~0.7МБ за <1с).
      const source = remoteSource(tmdb);
      if (!source) {
        return res.status(400).end("bad url");
      }
      // Опциональный размер: бэкдропы тащим широким кропом (w1280), постеры остаются мелкими.
      // Переписываем сегмент /t/p/<size>/ у TMDB; whitelist чтобы не дёргать произвольный путь.
      let target = tmdb;
      const requestedW = typeof req.query.w === "string" ? req.query.w : "";
      const w = /^(w342|w780|w1280|original)$/.test(requestedW)
        ? requestedW
        : source === "tmdb"
          ? "w342"
          : "";
      if (w) {
        target = tmdb.replace(/(image\.tmdb\.org\/t\/p\/)(w\d+|original)\//, `$1${w}/`);
      }
      desc = {
        source,
        keyParts: { target, requestedWidth: w || null },
        originalUrl: tmdb,
        ttlMs: sourceTtlMs(source),
      };
      fetcher = () => fetch(target, { signal: AbortSignal.timeout(15_000) });
    } else if (jf) {
      if (!config.media.jellyfin.configured) return res.status(503).end();
      if (!/^[a-f0-9]{8,}$/i.test(jf)) return res.status(400).end("bad id");
      const imgType = req.query.type === 'Backdrop' ? 'Backdrop/0' : 'Primary';
      const fillParam = imgType.startsWith('Backdrop') ? 'fillHeight=600' : 'maxWidth=342';
      const url = `${config.media.jellyfin.url}/Items/${jf}/Images/${imgType}?${fillParam}`;
      desc = {
        source: "jellyfin",
        keyParts: { jf, imgType, fillParam },
        itemId: jf,
        ttlMs: config.posterCache.jellyfinTtlMs,
      };
      fetcher = () => fetch(url, {
        headers: { "X-Emby-Token": config.media.jellyfin.apiKey! },
        signal: AbortSignal.timeout(15_000),
      });
    } else {
      return res.status(400).end("url or jf required");
    }

    const cached = await getPosterCacheEntry(desc);
    if (cached?.fresh) {
      sendCachedPoster(res, cached, "HIT");
      return;
    }
    if (cached) {
      sendCachedPoster(res, cached, "STALE");
      refreshPosterCacheInBackground(desc, fetcher);
      return;
    }

    const { upstream, body, entry } = await fetchAndStorePoster(desc, fetcher);
    if (!upstream.ok || !upstream.body) return res.status(502).end();
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Poster-Cache", entry ? "MISS" : "BYPASS");
    if (body) {
      res.end(body);
    } else {
      Readable.fromWeb(upstream.body as never).pipe(res);
    }
  } catch (e) {
    log.error("poster", `${req.method} ${req.path} failed`, errorDetail(e, {
      originalUrl: req.originalUrl,
      query: req.query,
    }));
    if (!res.headersSent) res.status(502).end();
  }
});
