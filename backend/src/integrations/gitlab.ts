import { config } from "../config.js";

interface GitLabIssue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  labels: string[];
  references?: { full?: string };
}

interface GitLabMR {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  references?: { full?: string };
}

export interface GitLabTask {
  id: string;
  title: string;
  status: "todo";
  priority: "low" | "medium" | "high";
  source: "gitlab";
  description: string | null;
  dueDate: null;
  createdAt: string;
  updatedAt: string;
}

function labelsToPriority(labels: string[]): "low" | "medium" | "high" {
  const l = labels.map((s) => s.toLowerCase());
  if (l.some((s) => s.includes("critical") || s.includes("high") || s.includes("urgent"))) return "high";
  if (l.some((s) => s.includes("low") || s.includes("minor"))) return "low";
  return "medium";
}

async function glFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${config.gitlab.url}/api/v4${path}`, {
    headers: { "PRIVATE-TOKEN": config.gitlab.token! },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GitLab ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

let cache: { data: GitLabTask[]; at: number } | null = null;

export async function getGitLabTasks(): Promise<GitLabTask[]> {
  if (!config.gitlab.configured) return [];
  if (cache && Date.now() - cache.at < config.poll.tasks) return cache.data;

  const uid = config.gitlab.userId;
  const [issuesResult, mrsResult] = await Promise.allSettled([
    glFetch<GitLabIssue[]>(`/issues?assignee_id=${uid}&state=opened&per_page=50`),
    glFetch<GitLabMR[]>(`/merge_requests?author_id=${uid}&state=opened&per_page=50`),
  ]);

  const now = new Date().toISOString();
  const tasks: GitLabTask[] = [];

  if (issuesResult.status === "fulfilled") {
    for (const i of issuesResult.value) {
      tasks.push({
        id: `gl-issue-${i.project_id}-${i.iid}`,
        title: i.title,
        status: "todo",
        priority: labelsToPriority(i.labels),
        source: "gitlab",
        description: i.references?.full ?? null,
        dueDate: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (mrsResult.status === "fulfilled") {
    for (const mr of mrsResult.value) {
      tasks.push({
        id: `gl-mr-${mr.project_id}-${mr.iid}`,
        title: `MR: ${mr.title}`,
        status: "todo",
        priority: "medium",
        source: "gitlab",
        description: mr.references?.full ?? null,
        dueDate: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  cache = { data: tasks, at: Date.now() };
  return tasks;
}
