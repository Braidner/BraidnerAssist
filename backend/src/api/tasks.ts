import { Router } from "express";
import { prisma } from "../db/client.js";
import { getGitLabTasks } from "../integrations/gitlab.js";

export const tasksRouter = Router();

// GET /api/tasks?source=&status=&priority=
tasksRouter.get("/", async (req, res) => {
  const { source, status, priority } = req.query as Record<string, string>;
  const where: Record<string, string> = {};
  if (source) where.source = source;
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const [local, gitlab] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    // Only include GitLab tasks when no source filter (or source=gitlab)
    !source || source === "gitlab" ? getGitLabTasks() : Promise.resolve([]),
  ]);

  // GitLab tasks filtered by status/priority if requested
  const filteredGitlab = gitlab.filter((t) => {
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    return true;
  });

  res.json([...local, ...filteredGitlab]);
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
