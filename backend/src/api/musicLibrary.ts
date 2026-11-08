import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, type Response } from "express";
import { config } from "../config.js";
import { fetchOriginalAudio, getMusicLibrary, linkedMusicUser, MusicAccessError, visibleAudioId } from "../integrations/musicLibrary.js";

export const musicLibraryRouter = Router();
export const musicStreamRouter = Router();

interface AudioTicket {
  itemId: string;
  appUserId: string;
  jellyfinUserId: string;
  expiresAt: number;
}

const tickets = new Map<string, AudioTicket>();
const ticketLifetime = 2 * 60 * 60_000;

function issueTicket(appUserId: string, jellyfinUserId: string, itemId: string) {
  const now = Date.now();
  // Insertion order follows expiry order. Cap the in-memory store even under continuous requests.
  for (const [key, ticket] of tickets) {
    if (ticket.expiresAt > now && tickets.size < 8192) break;
    tickets.delete(key);
  }
  const key = randomBytes(32).toString("base64url");
  tickets.set(key, { appUserId, jellyfinUserId, itemId, expiresAt: now + ticketLifetime });
  return `/api/music/stream/${key}`;
}

function musicError(res: Response, error: unknown) {
  if (error instanceof MusicAccessError) return res.status(error.status).json({ error: error.message });
  return res.status(502).json({ error: "Не удалось получить музыку из Jellyfin" });
}

musicLibraryRouter.get("/library", async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    res.json(await getMusicLibrary(res.locals.user.id));
  } catch (error) { musicError(res, error); }
});

musicLibraryRouter.post("/tracks/:id/play", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!config.media.jellyfin.configured) return res.status(503).json({ error: "Jellyfin не настроен" });
  try {
    const appUserId = res.locals.user.id;
    const user = await linkedMusicUser(appUserId);
    if (!user) return res.status(403).json({ error: "Для воспроизведения привяжите учётную запись Jellyfin и войдите повторно" });
    const id = await visibleAudioId(user, req.params.id);
    res.json({ url: issueTicket(appUserId, user.userId, id) });
  } catch (error) { musicError(res, error); }
});

// A native <audio> element can repeat a ticket for range requests. The ticket remains scoped to the
// issuing app account, its current Jellyfin identity and one visible track. It contains no credentials.
musicStreamRouter.get("/:ticket", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const ticket = tickets.get(req.params.ticket);
  if (!ticket || ticket.expiresAt <= Date.now() || !config.media.jellyfin.configured) return res.status(404).end();
  const abort = new AbortController();
  const cancel = () => abort.abort();
  res.once("close", cancel);
  try {
    const user = await linkedMusicUser(ticket.appUserId);
    if (!user || user.userId !== ticket.jellyfinUserId) return res.status(404).end();
    const id = await visibleAudioId(user, ticket.itemId);
    const requestHeaders: Record<string, string> = {};
    for (const key of ["range", "if-range"]) {
      const value = req.header(key);
      if (value) requestHeaders[key] = value;
    }
    // Limit time to response headers; long tracks and slow listeners may stream for much longer.
    const timer = setTimeout(cancel, 15_000);
    const upstream = await fetchOriginalAudio(user, id, req.method, requestHeaders, abort.signal)
      .finally(() => clearTimeout(timer));
    if (upstream.status !== 200 && upstream.status !== 206) {
      await upstream.body?.cancel();
      if (upstream.status === 416) {
        const range = upstream.headers.get("content-range");
        if (range) res.setHeader("Content-Range", range);
        return res.status(416).end();
      }
      return res.status([401, 403, 404].includes(upstream.status) ? 404 : 502).end();
    }
    res.status(upstream.status);
    for (const key of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(key);
      if (value) res.setHeader(key, value);
    }
    const mime = upstream.headers.get("content-type") ?? "";
    res.setHeader("Content-Type", /^(?:audio\/|video\/mp4\b|application\/ogg\b)/i.test(mime) ? mime : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]), res);
  } catch (error) {
    if (!res.headersSent && !res.destroyed) res.status(error instanceof MusicAccessError ? 404 : 502).end();
    else if (!res.destroyed) res.destroy();
  } finally {
    res.off("close", cancel);
  }
});
