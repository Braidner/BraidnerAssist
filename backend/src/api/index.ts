import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { prisma } from "../db/client.js";
import { config } from "../config.js";
import { tasksRouter } from "./tasks.js";
import { settingsRouter } from "./settings.js";
import { getWeather } from "../integrations/weather.js";
import { getServices } from "../integrations/services.js";
import { getProxmox } from "../integrations/proxmox.js";
import { getAutomations, toggleAutomation } from "../integrations/homeassistant.js";
import { getContainers, containerAction } from "../integrations/docker.js";
import { getAdguard, setAdguardProtection } from "../integrations/adguard.js";
import {
  getMedia,
  getLibrary,
  getSeriesDetail,
  getSeriesPageDetail,
  getMoviePageDetail,
  getMediaTitleDetail,
  getPlaybackPath,
  jellyfinRefresh,
  jellyfinProxy,
  jellyfinSessions,
  jellyfinPlayTo,
  qbAdd,
  qbAction,
  getContinueWatching,
  getMediaHome,
  reportPlaybackEvent,
  unifiedSearch,
  type MediaUserContext,
} from "../integrations/media.js";
import {
  nativeLookup,
  nativeLookupAll,
  nativeAdd,
  nativeReleaseSearch,
  nativeGrabRelease,
  nativeSeriesDiscoverDetail,
  nativeMovieDiscoverDetail,
  getTorrentRail,
  getPendingMediaTitles,
  getTitleTorrents,
  getMediaTitleStatuses,
  removeEmptyMediaTitle,
  MediaTitleRemoveError,
} from "../integrations/nativeMedia.js";
import { jackettHealth, jackettSearch } from "../integrations/jackett.js";
import {
  torrserverAdd,
  torrserverList,
  torrserverRemove,
  pickVideoFile,
  isBrowserPlayable,
} from "../integrations/torrserver.js";
import { tmdbSearch, tmdbTrending, tmdbPopular, tmdbTvToTvdb, tmdbDiscover, tmdbGenres } from "../integrations/tmdb.js";
import {
  getDiscoverHome,
  getBecauseRails,
  getSimilarRail,
  getCollectionRail,
  getTmdbDetail,
} from "../integrations/discover.js";
import {
  hiddenMediaKeys,
  listMediaPreferences,
  removeMediaPreference,
  upsertMediaPreference,
  type MediaPreferenceStatus,
} from "../integrations/mediaPreferences.js";
import { clearPosterCache, getPosterCacheStatus } from "../integrations/posterCache.js";
import { listDir, makeDir, renameEntry, moveEntry, removeEntry } from "../integrations/files.js";
import { listTitleTorrentFiles, repairSeriesEpisode } from "../integrations/mediaRepair.js";
import { log, getEntries, errorDetail } from "../logger.js";

export const apiRouter = Router();

function mediaUserContext(res: { locals: { user?: { id?: string } } }): MediaUserContext {
  const appUserId = res.locals.user?.id ?? null;
  return { appUserId, allowFallback: appUserId === "app-token" };
}

function logRouteError(
  ctx: string,
  req: Request,
  e: unknown,
  extra?: Record<string, unknown>,
): void {
  log.error(
    ctx,
    `${req.method} ${req.path} failed`,
    errorDetail(e, {
      originalUrl: req.originalUrl,
      params: req.params,
      query: req.query,
      ...extra,
    }),
  );
}

// Request logger — captures slow/failed requests into the in-memory ring buffer.
apiRouter.use((req, _res, next) => {
  const t0 = Date.now();
  _res.on("finish", () => {
    const ms = Date.now() - t0;
    const status = _res.statusCode;
    const line = `${req.method} ${req.path} → ${status} (${ms}ms)`;
    if (status >= 500) log.error("request", line);
    else if (status >= 400 || ms > 5000) log.warn("request", line);
  });
  next();
});

apiRouter.use((req, res, next) => {
  if (res.locals.user?.role !== "media") return next();
  if (req.path.startsWith("/media")) return next();
  return res.status(403).json({ error: "media role can access media only" });
});

apiRouter.use("/tasks", tasksRouter);
apiRouter.use("/settings", settingsRouter);

apiRouter.get("/weather", async (_req, res) => {
  try {
    res.json(await getWeather());
  } catch (e) {
    res.status(502).json({ configured: true, error: String(e) });
  }
});

apiRouter.get("/services", async (_req, res) => {
  try {
    res.json(await getServices());
  } catch (e) {
    res.status(502).json({ configured: false, error: String(e) });
  }
});

apiRouter.get("/proxmox", async (_req, res) => {
  try {
    res.json(await getProxmox());
  } catch (e) {
    res.status(502).json({ configured: false, error: String(e) });
  }
});

apiRouter.get("/homeassistant/automations", async (_req, res) => {
  try {
    res.json(await getAutomations());
  } catch (e) {
    res.status(502).json({ configured: false, error: String(e) });
  }
});

apiRouter.post("/homeassistant/automations/toggle", async (req, res) => {
  if (!config.hass.configured) return res.status(503).json({ configured: false });
  const { entityId } = req.body ?? {};
  if (!entityId) return res.status(400).json({ error: "entityId required" });
  try {
    await toggleAutomation(String(entityId));
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Календарь — локальные события уже работают через Prisma.
apiRouter.get("/calendar/events", async (_req, res) => {
  const events = await prisma.calendarEvent.findMany({
    orderBy: { startsAt: "asc" },
  });
  res.json(events);
});

apiRouter.post("/calendar/events", async (req, res) => {
  const { title, description, startsAt, endsAt, location } = req.body ?? {};
  if (!title || !startsAt) {
    return res.status(400).json({ error: "title and startsAt are required" });
  }
  const event = await prisma.calendarEvent.create({
    data: {
      title,
      description: description ?? null,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      location: location ?? null,
      source: "local",
    },
  });
  res.status(201).json(event);
});

// Hermes agent — статус и лог из SQLite (пишется агентом через MCP).
apiRouter.get("/hermes/status", async (_req, res) => {
  const status = await prisma.agentStatus.findUnique({ where: { id: 1 } });
  res.json(status ?? { status: "idle", message: null, updatedAt: null });
});

apiRouter.get("/hermes/log", async (_req, res) => {
  const entries = await prisma.agentLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(entries);
});

// Сводка задач, взятых Hermes в работу: статус, число логов, последняя активность.
apiRouter.get("/hermes/tasks", async (_req, res) => {
  const tasks = await prisma.task.findMany({
    where: { claimedBy: "hermes" },
    orderBy: { updatedAt: "desc" },
  });
  const grouped = await prisma.agentLog.groupBy({
    by: ["taskId"],
    where: { taskId: { in: tasks.map((t) => t.id) } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const byId = new Map(grouped.map((g) => [g.taskId, g]));
  res.json(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      claimedAt: t.claimedAt,
      logCount: byId.get(t.id)?._count._all ?? 0,
      lastActivity: byId.get(t.id)?._max.createdAt ?? t.claimedAt,
    })),
  );
});

apiRouter.post("/hermes/command", async (req, res) => {
  const { command, payload } = req.body ?? {};
  if (!command) return res.status(400).json({ error: "command is required" });
  const task = await prisma.agentTask.create({
    data: {
      command,
      payload: payload ? JSON.stringify(payload) : null,
      status: "queued",
    },
  });
  res.status(201).json(task);
});

// Список команд из очереди, новые первыми.
apiRouter.get("/hermes/commands", async (_req, res) => {
  const tasks = await prisma.agentTask.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json(tasks);
});

// Метрики аптайма сервисов — агрегация из ServiceCheck по каждому сервису.
apiRouter.get("/metrics/uptime", async (_req, res) => {
  try {
    const now = new Date();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ago7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Все строки за последние 7 дней
    const all7d = await prisma.serviceCheck.findMany({
      where: { createdAt: { gte: ago7d } },
      orderBy: { createdAt: "asc" },
    });

    // Группируем по имени
    const byName = new Map<string, typeof all7d>();
    for (const row of all7d) {
      const arr = byName.get(row.name) ?? [];
      arr.push(row);
      byName.set(row.name, arr);
    }

    const result = Array.from(byName.entries()).map(([name, rows]) => {
      const rows24h = rows.filter((r) => r.createdAt >= ago24h);
      const uptime24h = rows24h.length > 0
        ? Math.round((rows24h.filter((r) => r.status !== "bad").length / rows24h.length) * 100)
        : null;
      const uptime7d = rows.length > 0
        ? Math.round((rows.filter((r) => r.status !== "bad").length / rows.length) * 100)
        : null;
      const latRows = rows.filter((r) => r.latencyMs !== null);
      const avgLatency = latRows.length > 0
        ? Math.round(latRows.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / latRows.length)
        : null;
      // Последние ~60 сэмплов для спарклайна
      const samples = rows.slice(-60).map((r) => ({
        status: r.status,
        latencyMs: r.latencyMs,
      }));
      return { name, uptime24h, uptime7d, avgLatency, samples };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Docker — список контейнеров.
apiRouter.get("/docker/containers", async (_req, res) => {
  try {
    res.json(await getContainers());
  } catch (e) {
    res.status(502).json({ configured: false, error: String(e) });
  }
});

// Docker — действие над контейнером (start|stop|restart).
apiRouter.post("/docker/containers/:id/:action", async (req, res) => {
  if (!config.docker.configured) return res.status(503).json({ configured: false });
  const { id, action } = req.params;
  if (!["start", "stop", "restart"].includes(action)) {
    return res.status(400).json({ error: "Недопустимое действие. Разрешены: start, stop, restart" });
  }
  try {
    await containerAction(id, action);
    res.json({ ok: true });
  } catch (e) {
    logRouteError("docker", req, e, { id, action });
    res.status(502).json({ error: String(e) });
  }
});

// AdGuard Home — DNS-статистика.
apiRouter.get("/adguard", async (req, res) => {
  try {
    res.json(await getAdguard());
  } catch (e) {
    logRouteError("adguard", req, e);
    res.status(502).json({ configured: false, error: String(e) });
  }
});

// Медиа-стек — что играет + очередь загрузок.
apiRouter.get("/media", async (req, res) => {
  try {
    res.json(await getMedia());
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ configured: false, error: String(e) });
  }
});

apiRouter.get("/poster-cache/status", async (req, res) => {
  try {
    res.json(await getPosterCacheStatus());
  } catch (e) {
    logRouteError("poster", req, e);
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.delete("/poster-cache", async (req, res) => {
  try {
    res.json(await clearPosterCache());
  } catch (e) {
    logRouteError("poster", req, e);
    res.status(500).json({ error: String(e) });
  }
});

apiRouter.get("/media/jackett/health", async (req, res) => {
  try {
    res.json(await jackettHealth(req.query.force === "1"));
  } catch (e) {
    logRouteError("jackett", req, e);
    res.status(502).json({ configured: config.media.jackett.configured, error: String(e) });
  }
});

apiRouter.get("/media/torrent-rail", async (req, res) => {
  try {
    res.json(await getTorrentRail());
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.get("/media/pending-titles", async (req, res) => {
  try {
    res.json(await getPendingMediaTitles());
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.get("/media/statuses", async (req, res) => {
  try {
    res.json(await getMediaTitleStatuses(mediaUserContext(res)));
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.delete("/media/titles/:kind/:tmdbId", async (req, res) => {
  const kind = req.params.kind === "series" ? "series" : req.params.kind === "movie" ? "movie" : null;
  const tmdbId = Number(req.params.tmdbId);
  if (!kind || !Number.isFinite(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: "kind/tmdbId required" });
  try {
    res.json(await removeEmptyMediaTitle(kind, tmdbId));
  } catch (e) {
    if (e instanceof MediaTitleRemoveError) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    logRouteError("media", req, e, { kind, tmdbId });
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.get("/media/torrents/:kind/:tmdbId", async (req, res) => {
  const kind = req.params.kind === "series" ? "series" : req.params.kind === "movie" ? "movie" : null;
  const tmdbId = Number(req.params.tmdbId);
  if (!kind || !Number.isFinite(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: "kind/tmdbId required" });
  try {
    res.json(await getTitleTorrents(kind, tmdbId));
  } catch (e) {
    logRouteError("media", req, e, { kind, tmdbId });
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.get("/media/torrents/:kind/:tmdbId/:hash/files", async (req, res) => {
  const kind = req.params.kind === "series" ? "series" : req.params.kind === "movie" ? "movie" : null;
  const tmdbId = Number(req.params.tmdbId);
  const hash = String(req.params.hash ?? "");
  if (kind !== "series" || !Number.isFinite(tmdbId) || tmdbId <= 0 || !hash) {
    return res.status(400).json({ error: "series tmdbId/hash required" });
  }
  try {
    res.json(await listTitleTorrentFiles(tmdbId, hash));
  } catch (e) {
    logRouteError("media", req, e, { kind, tmdbId, hash });
    res.status(400).json({ error: String(e) });
  }
});

apiRouter.post("/media/series/:tmdbId/episodes/repair", async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  const hash = typeof req.body?.hash === "string" ? req.body.hash : "";
  const fileIndex = Number(req.body?.fileIndex);
  const seasonNumber = Number(req.body?.seasonNumber);
  const episodeNumber = Number(req.body?.episodeNumber);
  if (
    !Number.isFinite(tmdbId) ||
    tmdbId <= 0 ||
    !hash ||
    !Number.isInteger(fileIndex) ||
    !Number.isInteger(seasonNumber) ||
    !Number.isInteger(episodeNumber)
  ) {
    return res.status(400).json({ error: "tmdbId/hash/fileIndex/seasonNumber/episodeNumber required" });
  }
  try {
    res.json(await repairSeriesEpisode({ tmdbId, hash, fileIndex, seasonNumber, episodeNumber }));
  } catch (e) {
    logRouteError("media", req, e, { tmdbId, hash, fileIndex, seasonNumber, episodeNumber });
    res.status(400).json({ error: String(e) });
  }
});

apiRouter.get("/media/home", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getMediaHome(mediaUserContext(res)));
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Библиотека Jellyfin — недавно добавленные элементы.
apiRouter.get("/media/library", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getLibrary(mediaUserContext(res)));
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Детали сериала: сезоны + эпизоды (drill-down).
apiRouter.get("/media/series/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getSeriesDetail(req.params.id, mediaUserContext(res)));
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Детальная страница сериала: TMDB + Jellyfin playback state.
apiRouter.get("/media/detail/series/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getSeriesPageDetail(req.params.id, mediaUserContext(res)));
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Детальная страница фильма: TMDB + Jellyfin playback state.
apiRouter.get("/media/detail/movie/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getMoviePageDetail(req.params.id, mediaUserContext(res)));
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.get("/media/title/:kind/:tmdbId", async (req, res) => {
  const kind = req.params.kind === "series" ? "series" : req.params.kind === "movie" ? "movie" : null;
  const id = Number(req.params.tmdbId);
  if (!kind || !Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "kind/tmdbId required" });
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const idType = req.query.idType === "tvdb" || req.query.idType === "auto" ? req.query.idType : "tmdb";
  try {
    res.json(await getMediaTitleDetail(kind, id, { idType }, mediaUserContext(res)));
  } catch (e) {
    logRouteError("media", req, e, { kind, id, idType });
    res.status(502).json({ error: String(e) });
  }
});

// Discovery: объединённый поиск тайтлов (фильмы + сериалы) для виджета поиска.
apiRouter.get("/media/discover/search", async (req, res) => {
  if (!config.media.tmdb.configured) {
    return res.status(503).json({ configured: false });
  }
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    res.json(await nativeLookupAll(q));
  } catch (e) {
    logRouteError("tmdb", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Discovery: детальная страница сериала по tvdbId (тайтл может быть ещё не в библиотеке).
apiRouter.get("/media/discover/detail/series/:id", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const tvdbId = Number(req.params.id);
  if (!Number.isFinite(tvdbId) || tvdbId <= 0) return res.status(400).json({ error: "id required" });
  const idType = req.query.idType === "tmdb" || req.query.idType === "auto" ? req.query.idType : "tvdb";
  try {
    res.json(await nativeSeriesDiscoverDetail(tvdbId, idType, mediaUserContext(res)));
  } catch (e) {
    logRouteError("tmdb", req, e, { tvdbId, idType });
    res.status(502).json({ error: String(e) });
  }
});

// Discovery: детальная страница фильма по tmdbId.
apiRouter.get("/media/discover/detail/movie/:id", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const tmdbId = Number(req.params.id);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: "id required" });
  try {
    res.json(await nativeMovieDiscoverDetail(tmdbId, mediaUserContext(res)));
  } catch (e) {
    logRouteError("tmdb", req, e, { tmdbId });
    res.status(502).json({ error: String(e) });
  }
});

// Путь воспроизведения (HLS) для элемента — под наш прокси, без api_key.
apiRouter.get("/media/play/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getPlaybackPath(req.params.id, mediaUserContext(res)));
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

async function handlePlaybackEvent(
  kind: "start" | "progress" | "stop",
  req: Request,
  res: Response,
) {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  const { itemId, playSessionId, mediaSourceId, positionSeconds, durationSeconds, isPaused } = req.body ?? {};
  if (typeof itemId !== "string" || !itemId) {
    return res.status(400).json({ error: "itemId required" });
  }
  try {
    const result = await reportPlaybackEvent(
      kind,
      {
        itemId,
        playSessionId: typeof playSessionId === "string" ? playSessionId : null,
        mediaSourceId: typeof mediaSourceId === "string" ? mediaSourceId : null,
        positionSeconds: Number.isFinite(Number(positionSeconds)) ? Number(positionSeconds) : 0,
        durationSeconds: Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : 0,
        isPaused: Boolean(isPaused),
      },
      mediaUserContext(res),
    );
    res.json({ ok: true, ...result });
  } catch (e) {
    logRouteError("jellyfin", req, e, { playbackEvent: kind });
    res.status(502).json({ error: String(e) });
  }
}

apiRouter.post("/media/playback/start", (req, res) => {
  void handlePlaybackEvent("start", req, res);
});

apiRouter.post("/media/playback/progress", (req, res) => {
  void handlePlaybackEvent("progress", req, res);
});

apiRouter.post("/media/playback/stop", (req, res) => {
  void handlePlaybackEvent("stop", req, res);
});

// Скан библиотеки Jellyfin (после докачки торрента).
apiRouter.post("/media/scan", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    await jellyfinRefresh();
    res.json({ ok: true });
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Поиск релизов через Jackett Torznab.
apiRouter.get("/media/search", async (req, res) => {
  if (!config.media.jackett.configured) return res.status(503).json({ configured: false });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    res.json(await jackettSearch(q, { kind: "manual" }));
  } catch (e) {
    logRouteError("jackett", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Поиск тайтла в TMDB для выбора релиза.
apiRouter.get("/media/lookup", async (req, res) => {
  const kind = String(req.query.type ?? "") === "series" ? "series" : "movie";
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    res.json(await nativeLookup(kind, q));
  } catch (e) {
    logRouteError("tmdb", req, e, { kind });
    res.status(502).json({ error: String(e) });
  }
});

// Зарегистрировать тайтл в lightweight registry.
apiRouter.post("/media/add", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "series" ? "series" : "movie";
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  try {
    res.json({ ok: true, ...(await nativeAdd(kind, id)) });
  } catch (e) {
    logRouteError("tmdb", req, e, { kind, id });
    res.status(502).json({ error: String(e) });
  }
});

// Интерактивный поиск релизов (выбор раздачи с озвучкой/качеством).
apiRouter.post("/media/release/search", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "series" ? "series" : "movie";
  if (!config.media.jackett.configured) return res.status(503).json({ configured: false });
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  const seasonNumber = req.body?.seasonNumber != null ? Number(req.body.seasonNumber) : undefined;
  const query = String(req.body?.query ?? "").trim();
  const limitValue = Number(req.body?.limit ?? 50);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(Math.floor(limitValue), 100)) : 50;
  try {
    res.json(await nativeReleaseSearch(kind, id, seasonNumber, { query, limit }));
  } catch (e) {
    logRouteError("jackett", req, e, { kind, id, seasonNumber, query, limit });
    res.status(502).json({ error: String(e) });
  }
});

// Форс-граб выбранного релиза (guid + indexerId из результатов поиска).
apiRouter.post("/media/release/grab", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "series" ? "series" : "movie";
  if (!config.media.jackett.configured) return res.status(503).json({ configured: false });
  const id = Number(req.body?.id);
  const guid = String(req.body?.guid ?? "").trim();
  const indexerId = String(req.body?.indexerId ?? req.body?.indexer ?? "").trim();
  const seasonNumber = req.body?.seasonNumber != null ? Number(req.body.seasonNumber) : undefined;
  if (!Number.isFinite(id) || id <= 0 || !guid || !indexerId) return res.status(400).json({ error: "id, guid and indexerId required" });
  try {
    res.json(await nativeGrabRelease(kind, id, guid, indexerId, seasonNumber));
  } catch (e) {
    logRouteError("jackett", req, e, { kind, id, guid, indexerId, seasonNumber });
    res.status(502).json({ error: String(e) });
  }
});

// Устройства Jellyfin, которыми можно управлять (цели для «играть на ТВ»).
apiRouter.get("/media/devices", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await jellyfinSessions());
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Отправить элемент библиотеки на устройство Jellyfin.
apiRouter.post("/media/play-to", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  const sessionId = String(req.body?.sessionId ?? "").trim();
  const itemId = String(req.body?.itemId ?? "").trim();
  if (!sessionId || !itemId) return res.status(400).json({ error: "sessionId and itemId required" });
  try {
    await jellyfinPlayTo(sessionId, itemId);
    res.json({ ok: true });
  } catch (e) {
    logRouteError("jellyfin", req, e, { sessionId, itemId });
    res.status(502).json({ error: String(e) });
  }
});

// Добавить торрент (magnet или .torrent URL) в qBittorrent.
apiRouter.post("/media/torrent", async (req, res) => {
  if (!config.media.qbittorrent.configured) return res.status(503).json({ configured: false });
  const url = String(req.body?.url ?? req.body?.magnet ?? "").trim();
  if (!url) return res.status(400).json({ error: "url/magnet required" });
  try {
    await qbAdd(url);
    res.json({ ok: true });
  } catch (e) {
    logRouteError("qbittorrent", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// ── Media v2: TMDB дискавери ────────────────────────────────────────────
apiRouter.get("/media/tmdb/search", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    res.json(await tmdbSearch(q));
  } catch (e) {
    logRouteError("tmdb", req, e);
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.get("/media/tmdb/trending", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const kind = String(req.query.kind ?? "");
  try {
    if (kind === "movie" || kind === "series") res.json(await tmdbPopular(kind));
    else res.json(await tmdbTrending());
  } catch (e) {
    logRouteError("tmdb", req, e, { kind });
    res.status(502).json({ error: String(e) });
  }
});

// tmdbId сериала → tvdbId (для перехода в карточку сериала).
apiRouter.get("/media/tmdb/resolve", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const tmdbId = Number(req.query.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: "tmdbId required" });
  try {
    res.json({ tvdbId: await tmdbTvToTvdb(tmdbId) });
  } catch (e) {
    logRouteError("tmdb", req, e, { tmdbId });
    res.status(502).json({ error: String(e) });
  }
});

// ── Discover (LAMPA/ZONA-style подборки на TMDB) ───────────────────────
// Домашняя страница дискавери одним вызовом. Graceful: TMDB off → 200 {configured:false}.
apiRouter.get("/media/discover/rails", async (req, res) => {
  try {
    res.json(await getDiscoverHome(mediaUserContext(res)));
  } catch (e) {
    logRouteError("discover", req, e);
    // Никогда не валим виджет — отдаём пустую, но валидную форму.
    res.json({ configured: false, hero: null, genres: { movie: [], series: [] }, rails: [], error: String(e) });
  }
});

// Жанровый хаб (бесконечный скролл): /media/discover/genre/:kind/:genreId?year=&sort=&page=
apiRouter.get("/media/discover/genre/:kind/:genreId", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const kind = req.params.kind === "series" ? "series" : "movie";
  const genreId = Number(req.params.genreId);
  if (!Number.isFinite(genreId) || genreId <= 0) return res.status(400).json({ error: "genreId required" });
  try {
    const hidden = await hiddenMediaKeys(mediaUserContext(res).appUserId);
    const items = await tmdbDiscover(kind, {
      genreId,
      year: req.query.year ? String(req.query.year) : undefined,
      sort: req.query.sort ? String(req.query.sort) : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
    });
    res.json(items.filter((i) => !hidden.has(`${i.kind}:${i.tmdbId}`)));
  } catch (e) {
    logRouteError("discover", req, e, { kind, genreId });
    res.status(502).json({ error: String(e) });
  }
});

// Список жанров (ru) по типу — для жанрового хаба и фильтров.
apiRouter.get("/media/discover/genres", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const kind = req.query.kind === "series" ? "series" : "movie";
  try {
    res.json(await tmdbGenres(kind));
  } catch (e) {
    logRouteError("tmdb", req, e, { kind });
    res.status(502).json({ error: String(e) });
  }
});

// «Похожее» для детальной страницы. ?idType=tvdb для сериала с tvdbId (резолв в TMDB id).
apiRouter.get("/media/discover/similar/:kind/:id", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const kind = req.params.kind === "series" ? "series" : "movie";
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  const idType = req.query.idType === "tvdb" ? "tvdb" : "tmdb";
  try {
    res.json(await getSimilarRail(kind, id, idType));
  } catch (e) {
    logRouteError("discover", req, e, { kind, id, idType });
    res.status(502).json({ error: String(e) });
  }
});

// Lightweight TMDB metadata for discover/detail interactions (trailers, genres, runtime).
apiRouter.get("/media/discover/tmdb-detail/:kind/:id", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const kind = req.params.kind === "series" ? "series" : "movie";
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  const idType = req.query.idType === "tvdb" ? "tvdb" : "tmdb";
  try {
    const detail = await getTmdbDetail(kind, id, idType);
    if (!detail) return res.status(404).json({ error: "not found" });
    res.json(detail);
  } catch (e) {
    logRouteError("tmdb", req, e, { kind, id, idType });
    res.status(502).json({ error: String(e) });
  }
});

// «Потому что вы смотрели» — персональные рейлы (seed из Jellyfin watch history).
apiRouter.get("/media/discover/because", async (req, res) => {
  try {
    res.json(await getBecauseRails(mediaUserContext(res)));
  } catch (e) {
    logRouteError("discover", req, e);
    res.json([]); // персонализация необязательна — не валим
  }
});

// Франшиза (коллекция) фильма по tmdbId. 204 если фильм не в коллекции.
apiRouter.get("/media/discover/collection/:tmdbId", async (req, res) => {
  if (!config.media.tmdb.configured) return res.status(503).json({ configured: false });
  const tmdbId = Number(req.params.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: "tmdbId required" });
  try {
    const rail = await getCollectionRail(tmdbId);
    if (!rail) return res.status(204).end();
    res.json(rail);
  } catch (e) {
    logRouteError("discover", req, e, { tmdbId });
    res.status(502).json({ error: String(e) });
  }
});

// Local discovery preferences: watchlist / hidden / liked / disliked.
const prefStatuses = new Set<MediaPreferenceStatus>(["watchlist", "hidden", "liked", "disliked"]);

apiRouter.get("/media/preferences", async (req, res) => {
  const status = typeof req.query.status === "string" && prefStatuses.has(req.query.status as MediaPreferenceStatus)
    ? (req.query.status as MediaPreferenceStatus)
    : undefined;
  try {
    res.json(await listMediaPreferences(status, mediaUserContext(res).appUserId));
  } catch (e) {
    logRouteError("media", req, e, { status });
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.post("/media/preferences", async (req, res) => {
  const kind = req.body?.kind === "series" ? "series" : req.body?.kind === "movie" ? "movie" : null;
  const tmdbId = Number(req.body?.tmdbId);
  const status = String(req.body?.status ?? "");
  const title = String(req.body?.title ?? "").trim();
  if (!kind || !Number.isFinite(tmdbId) || tmdbId <= 0 || !prefStatuses.has(status as MediaPreferenceStatus) || !title) {
    return res.status(400).json({ error: "kind, tmdbId, status and title required" });
  }
  try {
    const pref = await upsertMediaPreference({
      kind,
      tmdbId,
      appUserId: mediaUserContext(res).appUserId,
      status: status as MediaPreferenceStatus,
      title,
      tvdbId: req.body?.tvdbId == null ? null : Number(req.body.tvdbId) || null,
      poster: req.body?.poster ?? null,
      backdrop: req.body?.backdrop ?? null,
      year: req.body?.year == null ? null : Number(req.body.year) || null,
      overview: req.body?.overview ?? null,
      rating: req.body?.rating == null ? null : Number(req.body.rating) || null,
    });
    res.status(201).json(pref);
  } catch (e) {
    logRouteError("media", req, e, { kind, tmdbId, status });
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.delete("/media/preferences/:kind/:tmdbId", async (req, res) => {
  const kind = req.params.kind === "series" ? "series" : req.params.kind === "movie" ? "movie" : null;
  const tmdbId = Number(req.params.tmdbId);
  if (!kind || !Number.isFinite(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: "kind/tmdbId required" });
  try {
    await removeMediaPreference(kind, tmdbId, mediaUserContext(res).appUserId);
    res.json({ ok: true });
  } catch (e) {
    logRouteError("media", req, e, { kind, tmdbId });
    res.status(502).json({ error: String(e) });
  }
});

// ── Media v2 (Фаза 3): файловый менеджер медиатеки (заперт в MEDIA_ROOT) ──
apiRouter.get("/media/files", async (req, res) => {
  if (!config.mediaFs.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await listDir(String(req.query.path ?? "")));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

apiRouter.post("/media/files/mkdir", async (req, res) => {
  if (!config.mediaFs.configured) return res.status(503).json({ configured: false });
  try {
    await makeDir(String(req.body?.path ?? ""), String(req.body?.name ?? ""));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

apiRouter.post("/media/files/rename", async (req, res) => {
  if (!config.mediaFs.configured) return res.status(503).json({ configured: false });
  try {
    await renameEntry(String(req.body?.path ?? ""), String(req.body?.name ?? ""));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

apiRouter.post("/media/files/move", async (req, res) => {
  if (!config.mediaFs.configured) return res.status(503).json({ configured: false });
  try {
    await moveEntry(String(req.body?.src ?? ""), String(req.body?.dest ?? ""));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

apiRouter.post("/media/files/delete", async (req, res) => {
  if (!config.mediaFs.configured) return res.status(503).json({ configured: false });
  try {
    await removeEntry(String(req.body?.path ?? ""));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// Управление торрентом (pause|resume|delete).
apiRouter.post("/media/torrent/:hash/:action", async (req, res) => {
  if (!config.media.qbittorrent.configured) return res.status(503).json({ configured: false });
  const { hash, action } = req.params;
  if (!["pause", "resume", "delete"].includes(action)) {
    return res.status(400).json({ error: "Недопустимое действие. Разрешены: pause, resume, delete" });
  }
  try {
    await qbAction(hash, action);
    res.json({ ok: true });
  } catch (e) {
    logRouteError("qbittorrent", req, e, { hash, action });
    res.status(502).json({ error: String(e) });
  }
});

// «Продолжить просмотр» из Jellyfin (недосмотренное с позицией).
apiRouter.get("/media/continue", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getContinueWatching(mediaUserContext(res)));
  } catch (e) {
    logRouteError("jellyfin", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Единый поиск: библиотека; discovery/release search идут отдельными native routes.
apiRouter.get("/media/unified", async (req, res) => {
  if (!config.media.configured) return res.status(503).json({ configured: false });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ inLibrary: [], discover: [], releases: [] });
  try {
    res.json(await unifiedSearch(q, mediaUserContext(res)));
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// ── TorrServer: мгновенный стриминг магнета без полной загрузки ──────────
// Добавить magnet/torrent-URL → вернуть hash + лучший видеофайл (для плеера) + весь список.
apiRouter.post("/media/torrserver/add", async (req, res) => {
  if (!config.media.torrserver.configured) return res.status(503).json({ configured: false });
  const link = String(req.body?.link ?? req.body?.magnet ?? "").trim();
  if (!link) return res.status(400).json({ error: "link/magnet required" });
  try {
    const info = await torrserverAdd(link, req.body?.title ? String(req.body.title) : undefined);
    const file = pickVideoFile(info.files);
    res.json({
      hash: info.hash,
      title: info.title,
      file: file ? { ...file, playable: isBrowserPlayable(file.path) } : null,
      files: info.files.map((f) => ({ ...f, playable: isBrowserPlayable(f.path) })),
    });
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Активные раздачи TorrServer.
apiRouter.get("/media/torrserver/list", async (req, res) => {
  if (!config.media.torrserver.configured) return res.status(503).json({ configured: false });
  try {
    const list = await torrserverList();
    res.json(
      list.map((t) => {
        const file = pickVideoFile(t.files);
        return {
          hash: t.hash,
          title: t.title,
          file: file ? { ...file, playable: isBrowserPlayable(file.path) } : null,
        };
      }),
    );
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Убрать раздачу из TorrServer (остановить стрим).
apiRouter.delete("/media/torrserver/:hash", async (req, res) => {
  if (!config.media.torrserver.configured) return res.status(503).json({ configured: false });
  try {
    await torrserverRemove(req.params.hash);
    res.json({ ok: true });
  } catch (e) {
    logRouteError("media", req, e);
    res.status(502).json({ error: String(e) });
  }
});

// Реверс-прокси к Jellyfin для плеера: токен инжектится на бэкенде, в браузер не утекает.
apiRouter.all("/media/jellyfin/*", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  const subpath = (req.params as Record<string, string>)[0] ?? "";
  const query = new URLSearchParams(req.query as Record<string, string>);
  try {
    const upstream = await jellyfinProxy(subpath, query);
    const ctype = upstream.headers.get("content-type") ?? "application/octet-stream";
    res.status(upstream.status);

    // m3u8-плейлисты переписываем, вырезая встроенный api_key.
    const isPlaylist = subpath.endsWith(".m3u8") || ctype.includes("mpegurl");
    if (isPlaylist) {
      const text = await upstream.text();
      const cleaned = text.replace(/([?&])api_key=[^&\s]*/gi, "$1").replace(/[?&]$/gm, "");
      res.setHeader("content-type", ctype);
      return res.send(cleaned);
    }

    res.setHeader("content-type", ctype);
    const clen = upstream.headers.get("content-length");
    if (clen) res.setHeader("content-length", clen);
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch (e) {
    logRouteError("jellyfin", req, e, { subpath });
    res.status(502).json({ error: String(e) });
  }
});

// AdGuard — переключатель защиты (пауза/возобновление DNS-фильтрации).
apiRouter.post("/adguard/protection", async (req, res) => {
  if (!config.adguard.configured) return res.status(503).json({ configured: false });
  const enabled = Boolean(req.body?.enabled);
  const durationMs = Number(req.body?.durationMs ?? 0) || 0;
  try {
    await setAdguardProtection(enabled, durationMs);
    res.json({ ok: true, enabled });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Backend logs — in-memory ring buffer, newest first, max 500 entries.
apiRouter.get("/logs", (_req, res) => {
  res.json({ entries: getEntries() });
});
