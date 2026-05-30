import { Router } from "express";
import { prisma } from "../db/client.js";
import { tasksRouter } from "./tasks.js";
import { getWeather } from "../integrations/weather.js";
import { getServices } from "../integrations/services.js";
import { config } from "../config.js";

export const apiRouter = Router();

apiRouter.use("/tasks", tasksRouter);

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

apiRouter.get("/homeassistant/automations", (_req, res) => {
  if (!config.hass.configured) return res.json({ configured: false });
  res.json({ configured: true, pending: "phase-4", automations: [] });
});

apiRouter.post("/homeassistant/automations/:id/toggle", (_req, res) => {
  if (!config.hass.configured) return res.status(503).json({ configured: false });
  res.status(501).json({ error: "not implemented (phase-4)" });
});

apiRouter.post("/homeassistant/scripts/:id/trigger", (_req, res) => {
  if (!config.hass.configured) return res.status(503).json({ configured: false });
  res.status(501).json({ error: "not implemented (phase-4)" });
});

apiRouter.get("/health/summary", (_req, res) => {
  res.json({ configured: true, pending: "phase-3", steps: null, activity: null });
});

apiRouter.post("/health/import", (_req, res) => {
  res.status(501).json({ error: "not implemented (phase-3)" });
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

// Hermes agent monitor — статус/лог уже читаются из БД.
apiRouter.get("/hermes/status", async (_req, res) => {
  const status = await prisma.agentStatus.findUnique({ where: { id: 1 } });
  res.json(status ?? { status: "idle", message: null, updatedAt: null });
});

apiRouter.get("/hermes/log", async (_req, res) => {
  const log = await prisma.agentLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(log);
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
