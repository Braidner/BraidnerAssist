import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { Router } from "express";
import { config } from "../config.js";
import { jellyfinDownload } from "../integrations/media.js";

const TICKET_TTL_MS = 15 * 60_000;
const tickets = new Map<string, { itemId: string; expiresAt: number }>();

function cleanExpiredTickets(now: number): void {
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt <= now) tickets.delete(ticket);
  }
}

export function createJellyfinDownloadTicket(itemId: string, now = Date.now()): string {
  if (!/^[a-f0-9-]{16,64}$/i.test(itemId)) throw new Error("invalid Jellyfin item id");
  cleanExpiredTickets(now);
  const ticket = randomBytes(24).toString("hex");
  tickets.set(ticket, { itemId, expiresAt: now + TICKET_TTL_MS });
  return ticket;
}

export function resolveJellyfinDownloadTicket(ticket: string, now = Date.now()): string | null {
  cleanExpiredTickets(now);
  return tickets.get(ticket)?.itemId ?? null;
}

export const jellyfinDownloadRouter = Router();

jellyfinDownloadRouter.get("/:ticket", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).end();
  const ticket = String(req.params.ticket ?? "");
  if (!/^[a-f0-9]{48}$/.test(ticket)) return res.status(404).end();
  const itemId = resolveJellyfinDownloadTicket(ticket);
  if (!itemId) return res.status(404).end("download link expired");

  try {
    const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
    const upstream = await jellyfinDownload(itemId, range);
    res.status(upstream.status);
    for (const header of [
      "content-type",
      "content-length",
      "content-range",
      "content-disposition",
      "accept-ranges",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader("cache-control", "private, no-store");
    if (!res.getHeader("accept-ranges")) res.setHeader("accept-ranges", "bytes");
    if (!res.getHeader("content-disposition")) res.setHeader("content-disposition", "attachment");
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch (error) {
    if (!res.headersSent) res.status(502).end(String(error));
  }
});
