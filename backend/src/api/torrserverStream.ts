// TorrServer видеопоток. <video src> не может слать bearer-токен → маршрут вынесен
// из-под jwtAuth (LAN-only), но жёстко ограничен анти-SSRF: только валидный hex-hash
// (^[a-f0-9]{40}$) и числовой index — проксируем в TorrServer с инжектом basic-auth
// и пробросом Range (seek по видео → 206 Partial Content).

import { Router } from "express";
import { Readable } from "node:stream";
import { config } from "../config.js";
import { torrserverStream } from "../integrations/torrserver.js";

export const torrserverStreamRouter = Router();

torrserverStreamRouter.get("/", async (req, res) => {
  if (!config.media.torrserver.configured) return res.status(503).end();
  const hash = typeof req.query.hash === "string" ? req.query.hash.toLowerCase() : "";
  const index = Number(req.query.index ?? 0);
  if (!/^[a-f0-9]{40}$/.test(hash)) return res.status(400).end("bad hash");
  if (!Number.isInteger(index) || index < 0) return res.status(400).end("bad index");

  try {
    const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
    const upstream = await torrserverStream(hash, index, range);
    res.status(upstream.status); // 200 или 206 (Partial Content)
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!res.getHeader("accept-ranges")) res.setHeader("accept-ranges", "bytes");
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(502).end(String(e));
  }
});
