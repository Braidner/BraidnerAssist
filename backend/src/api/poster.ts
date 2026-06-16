// Прокси постеров. Браузер бьётся только в LAN-origin дашборда, а картинку тащит
// бэкенд: TMDB по IPv4 (у клиента часто нет IPv6-egress до BunnyCDN → таймаут) и
// Jellyfin с инжектом токена (<img> не может слать bearer). Маршрут вынесен из-под
// jwtAuth (постеры — публичная афиша, не секрет; LAN-only), но жёстко ограничен по
// источнику (анти-SSRF): только image.tmdb.org, artworks.thetvdb.com и собственный
// Jellyfin по id.

import { Router } from "express";
import { Readable } from "node:stream";
import { config } from "../config.js";

export const posterRouter = Router();

posterRouter.get("/", async (req, res) => {
  const tmdb = typeof req.query.url === "string" ? req.query.url : "";
  const jf = typeof req.query.jf === "string" ? req.query.jf : "";

  try {
    let upstream: globalThis.Response;

    if (tmdb) {
      // SSRF-guard: разрешены только источники афиш *arr — TMDB (Radarr/фильмы) и
      // TheTVDB (Sonarr/сериалы). Прочее режем. Тащим как есть (full-size): прежний
      // даунсайз до w92 был обходом сломанного Path-MTU на egress хоста (oversized
      // пакеты BunnyCDN чёрнодырились после ~16КБ); после смены egress-маршрута баг
      // ушёл — full-size грузится мгновенно (TMDB original ~0.7МБ за <1с).
      if (
        !/^https:\/\/image\.tmdb\.org\//.test(tmdb) &&
        !/^https:\/\/artworks\.thetvdb\.com\//.test(tmdb)
      ) {
        return res.status(400).end("bad url");
      }
      upstream = await fetch(tmdb, { signal: AbortSignal.timeout(15_000) });
    } else if (jf) {
      if (!config.media.jellyfin.configured) return res.status(503).end();
      if (!/^[a-f0-9]{8,}$/i.test(jf)) return res.status(400).end("bad id");
      const url = `${config.media.jellyfin.url}/Items/${jf}/Images/Primary?maxWidth=342`;
      upstream = await fetch(url, {
        headers: { "X-Emby-Token": config.media.jellyfin.apiKey! },
        signal: AbortSignal.timeout(15_000),
      });
    } else {
      return res.status(400).end("url or jf required");
    }

    if (!upstream.ok || !upstream.body) return res.status(502).end();
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    Readable.fromWeb(upstream.body as never).pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
});
