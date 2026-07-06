import { Router, type Request, type Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import { fetch, Headers, type BodyInit, type Response as FetchResponse } from "undici";
import { config } from "../config.js";
import { log, errorDetail } from "../logger.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const REQUEST_HEADER_BLOCKLIST = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export const jellyfinGatewayRouter = Router();

jellyfinGatewayRouter.all("*", async (req, res) => {
  if (!config.media.jellyfin.configured) {
    return res.status(503).json({ configured: false, error: "Jellyfin не настроен" });
  }

  try {
    const upstream = await proxyJellyfinRequest(req);
    await sendUpstreamResponse(req, res, upstream);
  } catch (e) {
    log.error("jellyfin-gateway", `${req.method} ${req.originalUrl} failed`, errorDetail(e));
    if (!res.headersSent) res.status(502).json({ error: String(e) });
  }
});

async function proxyJellyfinRequest(req: Request): Promise<FetchResponse> {
  const jellyfinUrl = config.media.jellyfin.url;
  if (!jellyfinUrl) throw new Error("Jellyfin не настроен");
  const path = req.path === "/" ? "/" : req.path;
  const upstreamUrl = new URL(`${jellyfinUrl}${path}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => upstreamUrl.searchParams.append(key, String(entry)));
    } else if (value != null) {
      upstreamUrl.searchParams.append(key, String(value));
    }
  }

  const headers = forwardedHeaders(req);
  const body = await requestBody(req);
  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }

  return fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
    // Required by Node fetch when a request body is backed by a stream.
    ...(body && !(typeof body === "string" || body instanceof Uint8Array)
      ? { duplex: "half" as const }
      : {}),
  });
}

function forwardedHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (REQUEST_HEADER_BLOCKLIST.has(lower)) continue;
    if (value == null) continue;
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else headers.set(name, value);
  }
  return headers;
}

async function requestBody(req: Request): Promise<BodyInit | null> {
  if (req.method === "GET" || req.method === "HEAD") return null;

  if (
    req.body !== undefined &&
    req.body !== null &&
    String(req.headers["content-type"] ?? "").includes("application/json")
  ) {
    return JSON.stringify(req.body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function sendUpstreamResponse(
  req: Request,
  res: ExpressResponse,
  upstream: FetchResponse,
): Promise<void> {
  const contentType = upstream.headers.get("content-type") ?? "";
  const shouldRewrite =
    contentType.includes("application/json") ||
    contentType.includes("application/x-mpegurl") ||
    contentType.includes("application/vnd.apple.mpegurl") ||
    contentType.startsWith("text/");

  res.status(upstream.status);
  copyResponseHeaders(req, res, upstream, shouldRewrite);

  if (req.method === "HEAD" || upstream.body == null) {
    res.end();
    return;
  }

  if (shouldRewrite) {
    res.send(rewriteGatewayText(req, await upstream.text()));
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
}

function copyResponseHeaders(
  req: Request,
  res: ExpressResponse,
  upstream: FetchResponse,
  transformed: boolean,
): void {
  upstream.headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    if (transformed && (lower === "etag" || lower === "last-modified")) return;
    if (lower === "location") {
      res.setHeader(name, rewriteGatewayText(req, value));
      return;
    }
    res.setHeader(name, value);
  });
}

function rewriteGatewayText(req: Request, value: string): string {
  const jellyfinUrl = config.media.jellyfin.url;
  if (!jellyfinUrl) return value;
  const internal = jellyfinUrl.replace(/\/+$/, "");
  const external = externalGatewayBase(req).replace(/\/+$/, "");
  return value
    .split(internal)
    .join(external)
    .split(encodeURI(internal))
    .join(external);
}

function externalGatewayBase(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0].trim();
  const host = req.get("host") ?? `localhost:${config.backendPort}`;
  return `${proto}://${host}${req.baseUrl}`;
}
