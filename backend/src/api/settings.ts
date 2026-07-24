import { Router } from "express";
import { readServicesConfig, writeServicesConfig, invalidateServicesCache, type ServiceConfig } from "../integrations/services.js";
import { requireAdmin } from "../middleware/jwtAuth.js";
import {
  approveUser,
  createUser,
  deleteUser,
  isUserRole,
  listUsers,
  updateUser,
} from "../auth/users.js";
import { listJellyfinUsers } from "../integrations/jellyfinUsers.js";
import { getEnvSettings, updateEnvSettings } from "../settings/envSettings.js";

export const settingsRouter = Router();

settingsRouter.use(requireAdmin);

settingsRouter.get("/env", async (_req, res) => {
  try {
    res.json(await getEnvSettings());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

settingsRouter.put("/env", async (req, res) => {
  try {
    res.json(await updateEnvSettings(req.body));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

settingsRouter.get("/users", async (_req, res) => {
  try {
    res.json(await listUsers());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

settingsRouter.get("/jellyfin-users", async (_req, res) => {
  try {
    res.json(await listJellyfinUsers());
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

settingsRouter.post("/users", async (req, res) => {
  const { username, password, displayName, role } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !isUserRole(role)) {
    return res.status(400).json({ error: "username, password and role required" });
  }
  try {
    const user = await createUser({ username, password, displayName, role });
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

settingsRouter.post("/users/:id/approve", async (req, res) => {
  const { role } = req.body ?? {};
  if (!isUserRole(role)) {
    return res.status(400).json({ error: "valid role required" });
  }
  try {
    res.json(await approveUser(req.params.id, role));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

settingsRouter.put("/users/:id", async (req, res) => {
  const { displayName, role, active, password, jellyfinUserId } = req.body ?? {};
  if (role !== undefined && !isUserRole(role)) {
    return res.status(400).json({ error: "invalid role" });
  }
  if (active !== undefined && typeof active !== "boolean") {
    return res.status(400).json({ error: "invalid active flag" });
  }
  if (password !== undefined && typeof password !== "string") {
    return res.status(400).json({ error: "invalid password" });
  }
  if (jellyfinUserId !== undefined && typeof jellyfinUserId !== "string" && jellyfinUserId !== null) {
    return res.status(400).json({ error: "invalid jellyfin user id" });
  }
  try {
    const user = await updateUser(req.params.id, {
      displayName,
      role,
      active,
      password: password || undefined,
      jellyfinUserId,
    });
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

settingsRouter.delete("/users/:id", async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

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
