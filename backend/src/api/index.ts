import { Router } from "express";
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
  getPlaybackPath,
  jellyfinRefresh,
  jellyfinProxy,
  jellyfinSessions,
  jellyfinPlayTo,
  getRecommendations,
  qbAdd,
  qbAction,
  prowlarrSearch,
  arrLookup,
  arrAdd,
  arrReleaseSearch,
  arrReleaseGrab,
  manualImportCandidates,
  manualImportExecute,
  getCalendar,
  arrTriggerSearch,
  arrSetMonitored,
  getContinueWatching,
  unifiedSearch,
} from "../integrations/media.js";
import {
  torrserverAdd,
  torrserverList,
  torrserverRemove,
  pickVideoFile,
  isBrowserPlayable,
} from "../integrations/torrserver.js";
import { log, getEntries } from "../logger.js";

export const apiRouter = Router();

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
    res.status(502).json({ error: String(e) });
  }
});

// AdGuard Home — DNS-статистика.
apiRouter.get("/adguard", async (_req, res) => {
  try {
    res.json(await getAdguard());
  } catch (e) {
    res.status(502).json({ configured: false, error: String(e) });
  }
});

// Медиа-стек — что играет + очередь загрузок.
apiRouter.get("/media", async (_req, res) => {
  try {
    res.json(await getMedia());
  } catch (e) {
    res.status(502).json({ configured: false, error: String(e) });
  }
});

// Библиотека Jellyfin — недавно добавленные элементы.
apiRouter.get("/media/library", async (_req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getLibrary());
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Детали сериала: сезоны + эпизоды (drill-down).
apiRouter.get("/media/series/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getSeriesDetail(req.params.id));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Детальная страница сериала: Sonarr + Jellyfin (метаданные, все эпизоды, файлы).
apiRouter.get("/media/detail/series/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getSeriesPageDetail(req.params.id));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Детальная страница фильма: Radarr + Jellyfin.
apiRouter.get("/media/detail/movie/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getMoviePageDetail(req.params.id));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Путь воспроизведения (HLS) для элемента — под наш прокси, без api_key.
apiRouter.get("/media/play/:id", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json({ url: await getPlaybackPath(req.params.id) });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Скан библиотеки Jellyfin (после докачки торрента).
apiRouter.post("/media/scan", async (_req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    await jellyfinRefresh();
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Поиск релизов через Prowlarr.
apiRouter.get("/media/search", async (req, res) => {
  if (!config.media.prowlarr.configured) return res.status(503).json({ configured: false });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    res.json(await prowlarrSearch(q));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Поиск тайтла в Radarr (movie) / Sonarr (series) для добавления в библиотеку.
apiRouter.get("/media/lookup", async (req, res) => {
  const kind = String(req.query.type ?? "") === "series" ? "series" : "movie";
  const cfg = kind === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    res.json(await arrLookup(kind, q));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Добавить тайтл в Radarr/Sonarr (правильный пайплайн в медиатеку).
apiRouter.post("/media/add", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "series" ? "series" : "movie";
  const cfg = kind === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  try {
    res.json({ ok: true, ...(await arrAdd(kind, id)) });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Интерактивный поиск релизов (выбор раздачи с озвучкой/качеством).
apiRouter.post("/media/release/search", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "series" ? "series" : "movie";
  const cfg = kind === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  const seasonNumber = req.body?.seasonNumber != null ? Number(req.body.seasonNumber) : undefined;
  try {
    res.json(await arrReleaseSearch(kind, id, seasonNumber));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Форс-граб выбранного релиза (guid + indexerId из результатов поиска).
apiRouter.post("/media/release/grab", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "series" ? "series" : "movie";
  const cfg = kind === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const guid = String(req.body?.guid ?? "").trim();
  const indexerId = Number(req.body?.indexerId);
  if (!guid || !Number.isFinite(indexerId)) return res.status(400).json({ error: "guid and indexerId required" });
  try {
    await arrReleaseGrab(kind, guid, indexerId);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Кандидаты для ручного импорта застрявшей раздачи (по downloadId = qB-хеш).
apiRouter.post("/media/import/candidates", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "movie" ? "movie" : "series";
  const cfg = kind === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const downloadId = String(req.body?.downloadId ?? "").trim();
  if (!downloadId) return res.status(400).json({ error: "downloadId required" });
  try {
    res.json(await manualImportCandidates(kind, downloadId));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Импорт выбранных файлов (ManualImport — в обход реджекта «not in grabbed release»).
apiRouter.post("/media/import/execute", async (req, res) => {
  const kind = String(req.body?.type ?? "") === "movie" ? "movie" : "series";
  const cfg = kind === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const downloadId = String(req.body?.downloadId ?? "").trim();
  const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds.map(Number).filter(Number.isFinite) : [];
  if (!downloadId || fileIds.length === 0) return res.status(400).json({ error: "downloadId and fileIds required" });
  const importMode = req.body?.importMode === "move" ? "move" : "copy";
  try {
    const imported = await manualImportExecute(kind, downloadId, fileIds, importMode);
    res.json({ ok: true, imported });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Устройства Jellyfin, которыми можно управлять (цели для «играть на ТВ»).
apiRouter.get("/media/devices", async (_req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await jellyfinSessions());
  } catch (e) {
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
    res.status(502).json({ error: String(e) });
  }
});

// Подборки (ещё не в библиотеке) из import-list'ов Radarr/Sonarr.
apiRouter.get("/media/recommendations", async (_req, res) => {
  if (!config.media.radarr.configured && !config.media.sonarr.configured) {
    return res.status(503).json({ configured: false });
  }
  try {
    res.json(await getRecommendations());
  } catch (e) {
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
    res.status(502).json({ error: String(e) });
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
    res.status(502).json({ error: String(e) });
  }
});

// «Продолжить просмотр» из Jellyfin (недосмотренное с позицией).
apiRouter.get("/media/continue", async (_req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await getContinueWatching());
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Единый поиск: библиотека + discover (*arr lookup) + релизы (Prowlarr).
apiRouter.get("/media/unified", async (req, res) => {
  if (!config.media.configured) return res.status(503).json({ configured: false });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ inLibrary: [], discover: [], releases: [] });
  try {
    res.json(await unifiedSearch(q));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// ── Расписание / monitor / поиск сезона (удобный пайплайн сериалов) ──────
apiRouter.get("/media/calendar", async (req, res) => {
  if (!config.media.sonarr.configured && !config.media.radarr.configured) {
    return res.status(503).json({ configured: false });
  }
  const days = Math.min(Math.max(Number(req.query.days ?? 14) || 14, 1), 60);
  try {
    res.json(await getCalendar(days));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Запустить поиск: весь сезон / недостающие серии / фильм. id = внешний (tvdbId/tmdbId).
apiRouter.post("/media/season/search", async (req, res) => {
  const type = req.body?.type === "movie" ? "movie" : "series";
  const cfg = type === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  const seasonNumber = req.body?.seasonNumber != null ? Number(req.body.seasonNumber) : undefined;
  try {
    await arrTriggerSearch(type, id, seasonNumber);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Monitor toggle: сезон сериала / весь сериал / фильм.
apiRouter.post("/media/monitor", async (req, res) => {
  const type = req.body?.type === "movie" ? "movie" : "series";
  const cfg = type === "movie" ? config.media.radarr : config.media.sonarr;
  if (!cfg.configured) return res.status(503).json({ configured: false });
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "id required" });
  const monitored = Boolean(req.body?.monitored);
  const seasonNumber = req.body?.seasonNumber != null ? Number(req.body.seasonNumber) : undefined;
  try {
    await arrSetMonitored(type, id, monitored, seasonNumber);
    res.json({ ok: true, monitored });
  } catch (e) {
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
    res.status(502).json({ error: String(e) });
  }
});

// Активные раздачи TorrServer.
apiRouter.get("/media/torrserver/list", async (_req, res) => {
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

// Backend logs — in-memory ring buffer, newest first, max 200 entries.
apiRouter.get("/logs", (_req, res) => {
  res.json({ entries: getEntries() });
});
