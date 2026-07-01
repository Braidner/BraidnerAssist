import { config } from "../config.js";

export interface JellyfinUserRef {
  id: string;
  name: string;
}

interface JfUserDto {
  Id: string;
  Name: string;
  Policy?: Record<string, unknown>;
}

function jfHeaders(): Record<string, string> {
  return { "X-Emby-Token": config.media.jellyfin.apiKey! };
}

function assertConfigured(): void {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
}

function sameUsername(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

async function jfFetch(path: string, init: RequestInit = {}): Promise<Response> {
  assertConfigured();
  return fetch(`${config.media.jellyfin.url}${path}`, {
    ...init,
    headers: {
      ...jfHeaders(),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(8_000),
  });
}

export async function listJellyfinUsers(): Promise<JellyfinUserRef[]> {
  if (!config.media.jellyfin.configured) return [];
  const res = await jfFetch("/Users");
  if (!res.ok) throw new Error(`Jellyfin /Users responded ${res.status}`);
  const users = (await res.json()) as JfUserDto[];
  return users.map((user) => ({ id: user.Id, name: user.Name }));
}

export async function setDefaultJellyfinPolicy(jellyfinUserId: string): Promise<void> {
  if (!config.media.jellyfin.configured) return;
  const current = await jfFetch(`/Users/${encodeURIComponent(jellyfinUserId)}`);
  if (!current.ok) throw new Error(`Jellyfin user lookup responded ${current.status}`);
  const user = (await current.json()) as JfUserDto;
  const policy = {
    ...(user.Policy ?? {}),
    IsAdministrator: false,
    IsDisabled: false,
    EnableAllFolders: true,
    EnableMediaPlayback: true,
    EnableLiveTvAccess: false,
  };
  const res = await jfFetch(`/Users/${encodeURIComponent(jellyfinUserId)}/Policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policy),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Jellyfin policy update responded ${res.status}`);
  }
}

export async function setJellyfinPassword(jellyfinUserId: string, password: string): Promise<void> {
  if (!config.media.jellyfin.configured) return;
  const res = await jfFetch(`/Users/${encodeURIComponent(jellyfinUserId)}/Password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ NewPw: password, ResetPassword: false }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Jellyfin password update responded ${res.status}`);
  }
}

export async function ensureJellyfinUser(input: {
  username: string;
  password: string;
}): Promise<JellyfinUserRef | null> {
  if (!config.media.jellyfin.configured) return null;
  const users = await listJellyfinUsers();
  const existing = users.find((user) => sameUsername(user.name, input.username));
  if (existing) return existing;

  const res = await jfFetch("/Users/New", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Name: input.username, Password: input.password }),
  });
  if (!res.ok) throw new Error(`Jellyfin user create responded ${res.status}`);
  const created = (await res.json()) as JfUserDto;
  await setDefaultJellyfinPolicy(created.Id);
  return { id: created.Id, name: created.Name };
}
