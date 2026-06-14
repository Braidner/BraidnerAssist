import { Router } from "express";
import { prisma } from "../db/client.js";
import { config } from "../config.js";
import { tasksRouter } from "./tasks.js";
import { settingsRouter } from "./settings.js";
import { getWeather } from "../integrations/weather.js";
import { getServices } from "../integrations/services.js";
import { getProxmox } from "../integrations/proxmox.js";
import { getAutomations, toggleAutomation } from "../integrations/homeassistant.js";
import { getContainers, containerAction } from "../integrations/docker.js";
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

// Backend logs — in-memory ring buffer, newest first, max 200 entries.
apiRouter.get("/logs", (_req, res) => {
  res.json({ entries: getEntries() });
});
