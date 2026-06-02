import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { fetchAllTasks, upsertAgentTaskState } from "../api/tasks.js";
import { getAutomations, toggleAutomation } from "../integrations/homeassistant.js";
import { getServices } from "../integrations/services.js";
import { getWeather } from "../integrations/weather.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function createMcpServer() {
  const server = new McpServer({ name: "mission-control", version: "0.1.0" });

  // ── Tasks ────────────────────────────────────────────────────────────

  server.tool("get_tasks", "Get all tasks (local + GitLab)", async () => {
    const tasks = await fetchAllTasks();
    return ok(tasks);
  });

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
    "Update task status or priority",
    {
      id: z.string(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
    },
    async ({ id, status, priority }) => {
      const task = await prisma.task.update({
        where: { id },
        data: { ...(status && { status }), ...(priority && { priority }) },
      });
      return ok(task);
    },
  );

  server.tool(
    "claim_task",
    "Claim any task (local or GitLab): set it in_progress and mark it taken by Hermes",
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
    "Mark any task (local or GitLab) as done",
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
      const s = await prisma.agentStatus.upsert({
        where: { id: 1 },
        create: { id: 1, status, message: message ?? null },
        update: { status, message: message ?? null },
      });
      return ok(s);
    },
  );

  server.tool(
    "log_action",
    "Write an action entry to the Hermes log. Pass taskId to tie it to a specific task.",
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

  return server;
}
