import { Router } from "express";
import { prisma } from "../db/client.js";
import { getGitLabTasks } from "../integrations/gitlab.js";

export const tasksRouter = Router();

export async function fetchAllTasks(filters: { source?: string; status?: string; priority?: string } = {}) {
  const { source, status, priority } = filters;

  const [dbTasks, gitlab] = await Promise.all([
    prisma.task.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    !source || source === "gitlab" ? getGitLabTasks() : Promise.resolve([]),
  ]);

  // Локальные строки с source="gitlab" — это оверлей агента (claim/status/логи)
  // поверх живых GitLab-задач. Накладываем их на свежие данные, не дублируя.
  const realLocal = dbTasks.filter((t) => t.source === "local");
  const overlays = new Map(dbTasks.filter((t) => t.source === "gitlab").map((t) => [t.id, t]));

  const mergedGitlab = gitlab.map((g) => {
    const o = overlays.get(g.id);
    return o
      ? { ...g, status: o.status, claimedBy: o.claimedBy, claimedAt: o.claimedAt, updatedAt: o.updatedAt.toISOString() }
      : g;
  });

  let all = [...realLocal, ...mergedGitlab];
  if (source) all = all.filter((t) => t.source === source);
  if (status) all = all.filter((t) => t.status === status);
  if (priority) all = all.filter((t) => t.priority === priority);
  return all;
}

// Оверлей агентского состояния поверх любой задачи (локальной или GitLab).
// Для локальных id — обновляет строку; для GitLab id — создаёт строку-оверлей
// (source="gitlab"), к которой привязываются claim/status и логи (AgentLog.taskId).
export async function upsertAgentTaskState(
  id: string,
  data: { status?: string; claimedBy?: string | null; claimedAt?: Date | null },
) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (existing) {
    return prisma.task.update({ where: { id }, data });
  }
  const gl = (await getGitLabTasks()).find((t) => t.id === id);
  return prisma.task.create({
    data: {
      id,
      title: gl?.title ?? id,
      source: "gitlab",
      priority: gl?.priority ?? "medium",
      status: data.status ?? "todo",
      claimedBy: data.claimedBy ?? null,
      claimedAt: data.claimedAt ?? null,
    },
  });
}

// GET /api/tasks?source=&status=&priority=
tasksRouter.get("/", async (req, res) => {
  res.json(await fetchAllTasks(req.query as Record<string, string>));
});

// GET /api/tasks/:id/logs — записи лога Hermes по конкретной задаче
tasksRouter.get("/:id/logs", async (req, res) => {
  const entries = await prisma.agentLog.findMany({
    where: { taskId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(entries);
});

// POST /api/tasks
tasksRouter.post("/", async (req, res) => {
  const { title, description, status, priority, dueDate } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  const task = await prisma.task.create({
    data: {
      title,
      description: description ?? null,
      status: status ?? "todo",
      priority: priority ?? "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      source: "local",
    },
  });
  res.status(201).json(task);
});

// PUT /api/tasks/:id
tasksRouter.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority, dueDate } = req.body ?? {};
  try {
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(dueDate !== undefined && {
          dueDate: dueDate ? new Date(dueDate) : null,
        }),
      },
    });
    res.json(task);
  } catch {
    res.status(404).json({ error: "task not found" });
  }
});

// DELETE /api/tasks/:id — удаляет задачу и привязанные к ней логи Hermes.
tasksRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.$transaction([
      prisma.agentLog.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } }),
    ]);
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "task not found" });
  }
});
