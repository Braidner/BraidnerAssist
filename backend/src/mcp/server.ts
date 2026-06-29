import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { fetchAllTasks, upsertAgentTaskState } from "../api/tasks.js";
import { getAutomations, toggleAutomation } from "../integrations/homeassistant.js";
import { getServices } from "../integrations/services.js";
import { getWeather } from "../integrations/weather.js";
import { containerAction } from "../integrations/docker.js";
import { notify } from "../integrations/notify.js";
import { getMedia, qbAdd, jellyfinSessions, jellyfinPlayTo } from "../integrations/media.js";
import { nativeLookup, nativeReleaseSearch, nativeGrabRelease } from "../integrations/nativeMedia.js";
import { jackettHealth, jackettSearch } from "../integrations/jackett.js";
import { torrserverAdd, pickVideoFile, isBrowserPlayable } from "../integrations/torrserver.js";
import { getAdguard } from "../integrations/adguard.js";
import { config } from "../config.js";
import { getDiscoverHome } from "../integrations/discover.js";
import { tmdbSearch } from "../integrations/tmdb.js";
import { upsertMediaPreference } from "../integrations/mediaPreferences.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const INSTRUCTIONS = `Mission Control — personal dashboard for tasks, homelab services, Home Assistant and weather. You are Hermes, the agent operating it.

WORKING ON A TASK (works for BOTH local and GitLab tasks):
1. get_tasks → pick a task and copy its "id" field. GitLab ids look like "gl-issue-<project>-<iid>" or "gl-mr-<project>-<iid>"; local ids are cuids. Use this exact id everywhere below.
2. claim_task({ id }) → marks it in_progress and tags it as taken by Hermes. ALWAYS claim before working: for GitLab tasks this creates the local record that logs attach to, and it makes the task appear in the dashboard's "in work" list. GitLab itself is read-only; status/claim/logs live only in the local DB.
3. log_action({ action, details?, result?, taskId }) → record each step of progress. You MUST pass taskId = the SAME id from step 1, otherwise the entry becomes a loose global log not tied to the task and won't show under it. Call this as many times as needed while working.
4. complete_task({ id }) → marks it done when finished.

Use report_status to reflect your overall state (active/idle/error) on the dashboard. Other tools cover Home Assistant, homelab services and weather.

SELF-HEALING: if a homelab service appears to be down (get_services returns "bad"), you can try restarting the corresponding Docker container with restart_container({ id }) — use the short container ID or name.

MEDIA & DNS: Discovery uses TMDB only. get_discovery_home/search_discovery are read-only; add_media_preference/hide_discovery_title update the dashboard's local SQLite preferences (watchlist/hidden/liked/disliked). To get a movie or show into the Jellyfin library, use search_releases({ type, query, season? }) then grab_release({ type, guid, indexerId }). Release search uses Jackett Torznab; selected releases go to qBittorrent and are saved directly into the Jellyfin movies/tv folders. There is no native monitor, missing queue, hardlink importer, or manual import step. watch_now({ magnet }) streams a magnet instantly via TorrServer (no full download, not added to the library). get_media_status shows what's playing and the qBittorrent queue; get_dns_stats shows AdGuard query/block statistics.`;

export function createMcpServer() {
  const server = new McpServer(
    { name: "mission-control", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );

  // ── Tasks ────────────────────────────────────────────────────────────

  server.tool(
    "get_tasks",
    "List all tasks (local + live GitLab issues/MRs). Each task has an 'id' field — copy it to claim_task, log_action(taskId) and complete_task. GitLab ids look like 'gl-issue-<project>-<iid>'. Start here when picking up work.",
    async () => {
      const tasks = await fetchAllTasks();
      return ok(tasks);
    },
  );

  server.tool(
    "create_task",
    "Create a new local task",
    { title: z.string(), priority: z.enum(["low", "medium", "high"]).optional(), description: z.string().optional() },
    async ({ title, priority, description }) => {
      const task = await prisma.task.create({
        data: { title, priority: priority ?? "medium", description: description ?? null },
      });
      return ok(task);
    },
  );

  server.tool(
    "update_task",
    "Update status/priority of any task (local OR GitLab) by its id from get_tasks. Works for GitLab tasks too — creates the local overlay record if it doesn't exist yet, so it never fails with 'record not found'.",
    {
      id: z.string(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
    },
    async ({ id, status, priority }) => {
      const task = await upsertAgentTaskState(id, { status, priority });
      return ok(task);
    },
  );

  server.tool(
    "claim_task",
    "STEP 1 of working a task. Claim any task by its id from get_tasks (local OR GitLab): sets it in_progress and tags it as taken by Hermes. For GitLab tasks this also creates the local record that log_action entries attach to, so always claim before logging. Returns the task with the id to reuse for log_action(taskId) and complete_task.",
    { id: z.string() },
    async ({ id }) => {
      const task = await upsertAgentTaskState(id, {
        status: "in_progress",
        claimedBy: "hermes",
        claimedAt: new Date(),
      });
      return ok(task);
    },
  );

  server.tool(
    "complete_task",
    "FINAL STEP of working a task. Mark any task (local or GitLab) as done, using the same id you claimed.",
    { id: z.string() },
    async ({ id }) => {
      const task = await upsertAgentTaskState(id, { status: "done" });
      return ok(task);
    },
  );

  // ── Agent ────────────────────────────────────────────────────────────

  server.tool(
    "report_status",
    "Update Hermes agent status shown on the dashboard",
    { status: z.enum(["active", "idle", "error"]), message: z.string().optional() },
    async ({ status, message }) => {
      // Читаем текущий статус для определения перехода
      const prev = await prisma.agentStatus.findUnique({ where: { id: 1 } });

      const s = await prisma.agentStatus.upsert({
        where: { id: 1 },
        create: { id: 1, status, message: message ?? null },
        update: { status, message: message ?? null },
      });

      // Нотификация при переходе в error (fire-and-forget)
      if (status === "error" && prev?.status !== "error") {
        void notify(
          "Hermes: ошибка",
          message ?? "агент сообщил об ошибке",
          "high",
        );
      }

      return ok(s);
    },
  );

  server.tool(
    "log_action",
    "Record a step of progress while working a task (call repeatedly between claim_task and complete_task). Pass taskId = the task's id from get_tasks/claim_task so the entry shows under that task on the dashboard; omit taskId only for a global log not tied to any task. 'action' is a short verb label, 'details' is the human-readable note, 'result' is the outcome (e.g. 'ok'/'error').",
    {
      action: z.string(),
      details: z.string().optional(),
      result: z.string().optional(),
      taskId: z.string().optional(),
    },
    async ({ action, details, result, taskId }) => {
      const entry = await prisma.agentLog.create({
        data: { action, details: details ?? null, result: result ?? null, taskId: taskId ?? null },
      });
      return ok(entry);
    },
  );

  server.tool("get_agent_queue", "Get queued commands for Hermes to process", async () => {
    const tasks = await prisma.agentTask.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });
    return ok(tasks);
  });

  server.tool(
    "complete_agent_task",
    "Mark a queued command as done or errored",
    {
      id: z.string(),
      result: z.string().optional(),
      status: z.enum(["done", "error"]).optional(),
    },
    async ({ id, result, status }) => {
      const task = await prisma.agentTask.update({
        where: { id },
        data: {
          status: status ?? "done",
          result: result ?? null,
          completedAt: new Date(),
        },
      });
      return ok(task);
    },
  );

  // ── Home Assistant ───────────────────────────────────────────────────

  server.tool("get_automations", "List Home Assistant automations with current state", async () => {
    const data = await getAutomations();
    return ok(data);
  });

  server.tool(
    "toggle_automation",
    "Toggle a Home Assistant automation on/off",
    { entityId: z.string() },
    async ({ entityId }) => {
      await toggleAutomation(entityId);
      return ok({ ok: true, entityId });
    },
  );

  // ── Services ─────────────────────────────────────────────────────────

  server.tool("get_services", "Get homelab services health status", async () => {
    const data = await getServices();
    return ok(data);
  });

  // ── Weather ──────────────────────────────────────────────────────────

  server.tool("get_weather", "Get current weather and 3-day forecast", async () => {
    const data = await getWeather();
    return ok(data);
  });

  // ── Docker ───────────────────────────────────────────────────────────

  server.tool(
    "restart_container",
    "Restart a Docker container by its short ID or name. Use for self-healing when a service is down.",
    { id: z.string().describe("Container short ID (12 chars) or name") },
    async ({ id }) => {
      await containerAction(id, "restart");
      return ok({ ok: true, id, action: "restart" });
    },
  );

  // ── Media / DNS ──────────────────────────────────────────────────────

  server.tool(
    "add_torrent",
    "Add a torrent to qBittorrent by magnet link or .torrent URL. Once it finishes, it lands in the shared media folder and appears in Jellyfin after a library scan.",
    { magnet: z.string().describe("magnet: link or http(s) .torrent URL") },
    async ({ magnet }) => {
      await qbAdd(magnet);
      return ok({ ok: true });
    },
  );

  server.tool(
    "get_media_status",
    "Get media stack status: what's playing now in Jellyfin and the current qBittorrent/native download queue with progress, speed, ETA and seeds.",
    async () => {
      const data = await getMedia();
      return ok(data);
    },
  );

  server.tool(
    "search_releases",
    "Interactive release search for a movie or series season. Finds the title, then lists available torrent releases with quality, languages (dubbing/озвучка), size, seeders and any rejection reasons. Use grab_release to download a chosen one. For series pass the season number. Releases are cached for 10 min so grab_release can re-submit the full record — always call this before grab_release.",
    { type: z.enum(["movie", "series"]), query: z.string(), season: z.number().optional().describe("season number, series only") },
    async ({ type, query, season }) => {
      const found = await nativeLookup(type, query);
      if (found.length === 0) return ok({ ok: false, error: "Ничего не найдено" });
      const releases = await nativeReleaseSearch(type, found[0].id, season);
      return ok({ ok: true, title: found[0].title, count: releases.length, releases });
    },
  );

  server.tool(
    "grab_release",
    "Force-grab a specific release returned by search_releases (by guid + indexerId/indexer). Mission Control adds it to qBittorrent and saves it directly into the Jellyfin movies/tv library path.",
    { type: z.enum(["movie", "series"]), guid: z.string(), indexerId: z.union([z.number(), z.string()]) },
    async ({ type, guid, indexerId }) => {
      return ok(await nativeGrabRelease(type, guid, indexerId));
    },
  );

  server.tool(
    "get_dns_stats",
    "Get AdGuard Home DNS statistics: total queries, blocked count and percent, average processing latency, and top blocked domains.",
    async () => {
      const data = await getAdguard();
      return ok(data);
    },
  );

  server.tool(
    "list_devices",
    "List Jellyfin devices that can be remotely controlled (the Jellyfin app must be open on the device). Use to find a target for play_on_device.",
    async () => {
      const devices = await jellyfinSessions();
      return ok(devices);
    },
  );

  server.tool(
    "play_on_device",
    "Play a library item on an external device (e.g. the TV). itemId is a Jellyfin item id (from get_media_status / the library); deviceName is matched case-insensitively against list_devices. The Jellyfin app must be open on the target device.",
    { itemId: z.string(), deviceName: z.string() },
    async ({ itemId, deviceName }) => {
      const devices = await jellyfinSessions();
      const target = devices.find((d) => d.deviceName.toLowerCase() === deviceName.toLowerCase());
      if (!target) {
        return ok({ ok: false, error: `Устройство "${deviceName}" не найдено`, available: devices.map((d) => d.deviceName) });
      }
      await jellyfinPlayTo(target.id, itemId);
      return ok({ ok: true, device: target.deviceName });
    },
  );

  server.tool(
    "get_discovery_home",
    "Get TMDB-powered discovery home: hero, rails, genres for the genre hub, and local watchlist rail. Read-only and graceful when TMDB is not configured.",
    async () => {
      const data = await getDiscoverHome();
      return ok(data);
    },
  );

  server.tool(
    "search_discovery",
    "Search TMDB discovery titles without adding them. Use search_releases then grab_release for actual library additions.",
    { query: z.string().describe("Movie or series title") },
    async ({ query }) => {
      const data = await tmdbSearch(query);
      return ok(data);
    },
  );

  server.tool(
    "add_media_preference",
    "Save a local discovery preference (watchlist/liked/disliked/hidden). This only affects Mission Control recommendations; it does not add or delete media.",
    {
      kind: z.enum(["movie", "series"]),
      tmdbId: z.number(),
      status: z.enum(["watchlist", "hidden", "liked", "disliked"]),
      title: z.string(),
      poster: z.string().nullable().optional(),
      backdrop: z.string().nullable().optional(),
      year: z.number().nullable().optional(),
      overview: z.string().nullable().optional(),
      rating: z.number().nullable().optional(),
      tvdbId: z.number().nullable().optional(),
    },
    async (input) => {
      const pref = await upsertMediaPreference(input);
      return ok(pref);
    },
  );

  server.tool(
    "hide_discovery_title",
    "Hide a TMDB discovery title from future rails. This is local preference state only; it never removes Jellyfin content.",
    {
      kind: z.enum(["movie", "series"]),
      tmdbId: z.number(),
      title: z.string(),
      poster: z.string().nullable().optional(),
      backdrop: z.string().nullable().optional(),
      year: z.number().nullable().optional(),
      overview: z.string().nullable().optional(),
      rating: z.number().nullable().optional(),
      tvdbId: z.number().nullable().optional(),
    },
    async (input) => {
      const pref = await upsertMediaPreference({ ...input, status: "hidden" });
      return ok(pref);
    },
  );

  server.tool(
    "list_jackett_indexers",
    "List configured Jackett Torznab indexer health: status, latency, result count and last error.",
    async () => ok(await jackettHealth(true)),
  );

  server.tool(
    "test_jackett_search",
    "Run a raw Jackett Torznab search through Mission Control and return scored releases.",
    { query: z.string(), type: z.enum(["movie", "series", "manual"]).optional() },
    async ({ query, type }) => ok(await jackettSearch(query, { kind: type ?? "manual" })),
  );

  server.tool(
    "watch_now",
    "Stream a magnet/torrent instantly via TorrServer without a full download or adding it to the library. Returns the torrent hash, the best video file and a relative streamUrl (/api/media/torrserver/stream?hash=&index=) playable in a browser for mp4/m4v/webm; other containers (mkv/avi) need an external player. Use for a quick one-off watch; for permanent library additions prefer search_releases/grab_release.",
    { magnet: z.string().describe("magnet: link or .torrent URL") },
    async ({ magnet }) => {
      if (!config.media.torrserver.configured) return ok({ error: "TorrServer не настроен" });
      const info = await torrserverAdd(magnet);
      const file = pickVideoFile(info.files);
      return ok({
        hash: info.hash,
        title: info.title,
        file: file ? { path: file.path, index: file.index, browserPlayable: isBrowserPlayable(file.path) } : null,
        streamUrl: file ? `/api/media/torrserver/stream?hash=${info.hash}&index=${file.index}` : null,
      });
    },
  );

  return server;
}
