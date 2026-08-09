import { config } from "../config.js";
import { prisma } from "../db/client.js";

export interface JellyfinUserRef {
  id: string;
  name: string;
}

export interface JellyfinAuthResult {
  userId: string;
  username: string;
  accessToken: string;
}

interface JfUserDto {
  Id: string;
  Name: string;
  Policy?: Record<string, unknown>;
}

function jfHeaders(): Record<string, string> {
  return { "X-Emby-Token": config.media.jellyfin.apiKey! };
}

export function jellyfinClientAuthHeader(token: string): string {
  return `MediaBrowser Client="Pultra", Device="Pultra", DeviceId="pultra-dashboard", Version="0.1.0", Token="${token}"`;
}

export function jellyfinUserHeaders(token: string): Record<string, string> {
  return {
    "X-Emby-Token": token,
    "X-Emby-Authorization": jellyfinClientAuthHeader(token),
    Authorization: jellyfinClientAuthHeader(token),
  };
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

export async function jellyfinUsernameById(jellyfinUserId: string): Promise<string | null> {
  if (!config.media.jellyfin.configured) return null;
  const users = await listJellyfinUsers();
  return users.find((user) => user.id === jellyfinUserId)?.name ?? null;
}

export async function authenticateJellyfinUser(input: {
  username: string;
  password: string;
}): Promise<JellyfinAuthResult | null> {
  if (!config.media.jellyfin.configured) return null;
  const res = await fetch(`${config.media.jellyfin.url}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Authorization": jellyfinClientAuthHeader(""),
      Authorization: jellyfinClientAuthHeader(""),
    },
    body: JSON.stringify({ Username: input.username, Pw: input.password }),
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Jellyfin AuthenticateByName responded ${res.status}`);
  const body = (await res.json()) as {
    User?: { Id?: string; Name?: string };
    AccessToken?: string;
  };
  const userId = body.User?.Id;
  const username = body.User?.Name;
  const accessToken = body.AccessToken;
  if (!userId || !username || !accessToken) return null;
  return { userId, username, accessToken };
}

export async function refreshJellyfinAccessTokenForUser(input: {
  appUserId: string;
  password: string;
}): Promise<boolean> {
  if (!config.media.jellyfin.configured) return false;
  const user = await prisma.appUser.findUnique({
    where: { id: input.appUserId },
    select: { jellyfinUserId: true },
  });
  if (!user?.jellyfinUserId) return false;
  const username = await jellyfinUsernameById(user.jellyfinUserId);
  if (!username) return false;
  const auth = await authenticateJellyfinUser({ username, password: input.password });
  if (!auth) return false;
  await prisma.appUser.update({
    where: { id: input.appUserId },
    data: {
      jellyfinUserId: auth.userId,
      jellyfinAccessToken: auth.accessToken,
    },
  });
  return true;
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
