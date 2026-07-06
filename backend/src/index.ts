import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { apiRouter } from "./api/index.js";
import { authRouter } from "./api/auth.js";
import { versionRouter } from "./api/version.js";
import { posterRouter } from "./api/poster.js";
import { jellyfinGatewayRouter } from "./api/jellyfinGateway.js";
import { torrserverStreamRouter } from "./api/torrserverStream.js";
import { jwtAuth } from "./middleware/jwtAuth.js";
import { mcpRouter } from "./mcp/handler.js";
import { startSampler } from "./sampler.js";
import { startPosterCacheCleanup } from "./integrations/posterCache.js";

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck (без авторизации — для docker/uptime).
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "mission-control-backend",
    integrations: {
      gitlab: config.gitlab.configured,
      homeAssistant: config.hass.configured,
      weather: config.weather.configured,
      caldav: config.caldav.configured,
    },
  });
});

// Public: login, version (no token required)
app.use("/api/auth", authRouter);
app.use("/api/version", versionRouter);
// Постер-прокси: <img> не может слать bearer → маршрут публичный (LAN-only),
// но жёстко ограничен по источнику (анти-SSRF). Вынесен из-под jwtAuth.
app.use("/api/poster", posterRouter);
// TorrServer видеопоток: <video> не шлёт bearer → публичный (LAN-only) + анти-SSRF.
// Монтируется ДО jwtAuth, чтобы перехватить /api/media/torrserver/stream.
app.use("/api/media/torrserver/stream", torrserverStreamRouter);

// Jellyfin-compatible gateway for native clients. It intentionally lives outside
// /api because Jellyfin clients expect server endpoints at the configured base URL.
app.use("/jf", jellyfinGatewayRouter);

// All other /api routes require valid JWT
app.use("/api", jwtAuth, apiRouter);

// MCP Streamable HTTP — own auth + Origin guard inside mcpRouter
app.use("/mcp", mcpRouter);

app.listen(config.backendPort, () => {
  console.log(
    `[mission-control] backend listening on :${config.backendPort} (${config.nodeEnv})`,
  );
  startSampler();
  startPosterCacheCleanup();
});
