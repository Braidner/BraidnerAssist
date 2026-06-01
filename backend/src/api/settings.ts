import { Router } from "express";
import { readServicesConfig, writeServicesConfig, invalidateServicesCache, type ServiceConfig } from "../integrations/services.js";

export const settingsRouter = Router();

settingsRouter.get("/services", async (_req, res) => {
  try {
    res.json(await readServicesConfig());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

settingsRouter.put("/services", async (req, res) => {
  const services = req.body as ServiceConfig[];
  if (!Array.isArray(services)) return res.status(400).json({ error: "array expected" });
  try {
    await writeServicesConfig(services);
    invalidateServicesCache();
    res.json({ ok: true, count: services.length });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
