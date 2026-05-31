import { config } from "../config.js";

interface GitLabIssue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  labels: string[];
  due_date: string | null;
  web_url: string;
  references?: { full?: string };
  created_at: string;
  updated_at: string;
}

interface GitLabMR {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  labels: string[];
  source_branch: string;
  target_branch: string;
  web_url: string;
  references?: { full?: string };
  created_at: string;
  updated_at: string;
}

export interface GitLabTask {
  id: string;
  title: string;
  status: "todo";
  priority: "low" | "medium" | "high";
  source: "gitlab";
  // detail fields for drawer
  webUrl: string;
  descriptionText: string | null;
  labels: string[];
  projectRef: string | null;    // e.g. "group/project#12"
  iid: number;
  kind: "issue" | "mr";
  dueDate: string | null;
  branchInfo: string | null;    // "feat/x → main" for MRs
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
    glFetch<GitLabIssue[]>(`/issues?assignee_id=${uid}&state=opened&scope=all&order_by=updated_at&sort=desc&per_page=100`),
    glFetch<GitLabMR[]>(`/merge_requests?assignee_id=${uid}&state=opened&scope=all&order_by=updated_at&sort=desc&per_page=100`),
  ]);

  const tasks: GitLabTask[] = [];

  if (issuesResult.status === "fulfilled") {
    for (const i of issuesResult.value) {
      tasks.push({
        id: `gl-issue-${i.project_id}-${i.iid}`,
        title: i.title,
        status: "todo",
        priority: labelsToPriority(i.labels),
        source: "gitlab",
        webUrl: i.web_url,
        descriptionText: i.description,
        labels: i.labels,
        projectRef: i.references?.full ?? null,
        iid: i.iid,
        kind: "issue",
        dueDate: i.due_date,
        branchInfo: null,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
      });
    }
  }

  if (mrsResult.status === "fulfilled") {
    for (const mr of mrsResult.value) {
      tasks.push({
        id: `gl-mr-${mr.project_id}-${mr.iid}`,
        title: mr.title,
        status: "todo",
        priority: labelsToPriority(mr.labels),
        source: "gitlab",
        webUrl: mr.web_url,
        descriptionText: mr.description,
        labels: mr.labels,
        projectRef: mr.references?.full ?? null,
        iid: mr.iid,
        kind: "mr",
        dueDate: null,
        branchInfo: `${mr.source_branch} → ${mr.target_branch}`,
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
      });
    }
  }

  cache = { data: tasks, at: Date.now() };
  return tasks;
}
