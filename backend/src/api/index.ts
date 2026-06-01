import { Router } from "express";
import { prisma } from "../db/client.js";
import { tasksRouter } from "./tasks.js";
import { settingsRouter } from "./settings.js";
import { getWeather } from "../integrations/weather.js";
import { getServices } from "../integrations/services.js";
import { getAutomations, toggleAutomation } from "../integrations/homeassistant.js";
import { listSessions, startSession, getSession, sendTurn } from "../integrations/hermes.js";
import { config } from "../config.js";
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

// Hermes agent — данные напрямую из Hermes Agent API (Nous Research).
apiRouter.get("/hermes/sessions", async (_req, res) => {
  try {
    res.json(await listSessions());
  } catch (e) {
    res.status(502).json({ configured: false, sessions: [], error: String(e) });
  }
});

apiRouter.post("/hermes/session", async (req, res) => {
  if (!config.hermes.configured) return res.status(503).json({ configured: false });
  const { taskRef, title, description } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  const input = `Задача ${taskRef ?? ""}: ${title}\n\n${description ?? ""}`.trim();
  try {
    res.status(201).json(await startSession(input));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.get("/hermes/sessions/:id", async (req, res) => {
  try {
    res.json(await getSession(req.params.id));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

apiRouter.post("/hermes/sessions/:id/chat", async (req, res) => {
  if (!config.hermes.configured) return res.status(503).json({ configured: false });
  const { input } = req.body ?? {};
  if (!input) return res.status(400).json({ error: "input is required" });
  try {
    await sendTurn(req.params.id, String(input));
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Backend logs — in-memory ring buffer, newest first, max 200 entries.
apiRouter.get("/logs", (_req, res) => {
  res.json({ entries: getEntries() });
});
