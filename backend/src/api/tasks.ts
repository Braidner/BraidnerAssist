import { Router } from "express";
import { prisma } from "../db/client.js";
import { getGitLabTasks } from "../integrations/gitlab.js";

export const tasksRouter = Router();

export async function fetchAllTasks(filters: { source?: string; status?: string; priority?: string } = {}) {
  const { source, status, priority } = filters;
  const where: Record<string, string> = {};
  if (source) where.source = source;
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const [local, gitlab] = await Promise.all([
    prisma.task.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    !source || source === "gitlab" ? getGitLabTasks() : Promise.resolve([]),
  ]);

  return [
    ...local,
    ...gitlab.filter((t) => {
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      return true;
    }),
  ];
}

// GET /api/tasks?source=&status=&priority=
tasksRouter.get("/", async (req, res) => {
  res.json(await fetchAllTasks(req.query as Record<string, string>));
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

// DELETE /api/tasks/:id
tasksRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.task.delete({ where: { id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "task not found" });
  }
});
