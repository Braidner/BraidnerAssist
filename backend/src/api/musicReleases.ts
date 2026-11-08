import { Router, type Response } from "express";
import { DownloadQuotaExceededError } from "../integrations/downloadQuota.js";
import {
  getMusicDownloads, grabMusicRelease, MusicRequestError, searchMusicReleases,
} from "../integrations/musicReleases.js";

export const musicReleasesRouter = Router();
musicReleasesRouter.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

function musicError(res: Response, error: unknown) {
  if (error instanceof MusicRequestError) return res.status(error.status).json({ error: error.message });
  if (error instanceof DownloadQuotaExceededError) {
    return res.status(429).json({ error: error.message, code: error.code, period: error.period });
  }
  return res.status(502).json({ error: "Музыкальный сервис не ответил. Повторите запрос позже." });
}

musicReleasesRouter.get("/releases", async (req, res) => {
  if (req.query.q !== undefined && (typeof req.query.q !== "string" || req.query.q.length > 180)) {
    return res.status(400).json({ error: "Поисковая строка должна быть не длиннее 180 символов" });
  }
  try { res.json(await searchMusicReleases(res.locals.user.id, (req.query.q ?? "").trim())); }
  catch (e) { musicError(res, e); }
});

musicReleasesRouter.post("/releases/:id/grab", async (req, res) => {
  try { res.json(await grabMusicRelease(res.locals.user.id, req.params.id)); }
  catch (e) { musicError(res, e); }
});

musicReleasesRouter.get("/downloads", async (_req, res) => {
  try { res.json(await getMusicDownloads(res.locals.user.id)); }
  catch (e) { musicError(res, e); }
});
