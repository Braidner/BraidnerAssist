import { createHash } from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { jellyfinUserHeaders } from "./jellyfinUsers.js";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  disc: number;
  number: number;
  duration: number;
  codec: string | null;
  bitDepth: number | null;
  sampleRate: number | null;
}

export interface MusicAlbum {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  genres: string[];
  coverId: string | null;
  addedAt: string | null;
  tracks: MusicTrack[];
}

interface AudioItem {
  Id: string;
  Type: string;
  Name?: string;
  Album?: string;
  AlbumId?: string;
  AlbumArtist?: string;
  Artists?: string[];
  ProductionYear?: number;
  DateCreated?: string;
  Genres?: string[];
  ImageTags?: { Primary?: string };
  AlbumPrimaryImageTag?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  RunTimeTicks?: number;
  PlayAccess?: string;
  MediaStreams?: { Type: string; Codec?: string; BitDepth?: number; SampleRate?: number }[];
}

interface MusicUser {
  userId: string;
  token: string;
}

export class MusicAccessError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

// Both compact and dashed Jellyfin UUIDs are accepted. All downstream URLs use the compact form.
function itemId(value: string | undefined): string | null {
  if (!value || !/^(?:[\da-f]{32}|[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})$/i.test(value)) return null;
  return value.replaceAll("-", "").toLowerCase();
}

export async function linkedMusicUser(appUserId: string): Promise<MusicUser | null> {
  const user = await prisma.appUser.findFirst({
    where: { id: appUserId, active: true, approvalStatus: "approved", role: { in: ["admin", "media"] } },
    select: { jellyfinUserId: true, jellyfinAccessToken: true },
  });
  return user?.jellyfinUserId && user.jellyfinAccessToken
    ? { userId: user.jellyfinUserId, token: user.jellyfinAccessToken }
    : null;
}

async function musicJson<T>(user: MusicUser, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${config.media.jellyfin.url}${path}`);
  url.search = new URLSearchParams({ UserId: user.userId, ...params }).toString();
  const response = await fetch(url, {
    headers: jellyfinUserHeaders(user.token), redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new MusicAccessError(403, "Войдите повторно, чтобы подключить свою учётную запись Jellyfin");
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) throw new MusicAccessError(404, "Трек недоступен");
    throw new Error(`Jellyfin Items HTTP ${response.status}`);
  }
  return await response.json() as T;
}

function isPlayable(item: AudioItem): boolean {
  return item.Type === "Audio" && item.PlayAccess === "Full";
}

function addTrack(albums: Map<string, MusicAlbum>, item: AudioItem, id: string) {
  const title = item.Name || "Без названия";
  const artist = item.Artists?.join(", ") || item.AlbumArtist || "Неизвестный исполнитель";
  const albumArtist = item.AlbumArtist || artist;
  const albumId = itemId(item.AlbumId);
  // Untagged singles get their own entry. Older collections sometimes have album tags without an AlbumId.
  const groupId = albumId ?? (item.Album ? createHash("sha256")
    .update(JSON.stringify([item.Album, albumArtist, item.ProductionYear])).digest("hex") : id);
  const coverId = (item.AlbumPrimaryImageTag && albumId) || (item.ImageTags?.Primary ? id : null);
  let album = albums.get(groupId);
  if (!album) {
    album = { id: groupId, title: item.Album || title, artist: albumArtist, year: item.ProductionYear ?? null,
      genres: [], coverId, addedAt: item.DateCreated ?? null, tracks: [] };
    albums.set(groupId, album);
  }
  album.coverId ??= coverId;
  if (item.DateCreated && (!album.addedAt || item.DateCreated > album.addedAt)) album.addedAt = item.DateCreated;
  for (const genre of item.Genres ?? []) {
    if (genre && !album.genres.includes(genre)) album.genres.push(genre);
  }
  const stream = item.MediaStreams?.find((s) => s.Type === "Audio");
  album.tracks.push({
    id, title, artist, disc: item.ParentIndexNumber ?? 1, number: item.IndexNumber ?? 0,
    duration: (item.RunTimeTicks ?? 0) / 10_000_000, codec: stream?.Codec ?? null,
    bitDepth: stream?.BitDepth ?? null, sampleRate: stream?.SampleRate ?? null,
  });
}

export async function getMusicLibrary(appUserId: string) {
  const configured = config.media.jellyfin.configured;
  const empty = { configured, linked: false, albums: [] };
  if (!configured) return empty;
  const user = await linkedMusicUser(appUserId);
  if (!user) return empty;
  const albums = new Map<string, MusicAlbum>();
  const seen = new Set<string>();
  const limit = 300;
  let offset = 0;
  try {
    for (;;) {
      const page = await musicJson<{ Items: AudioItem[]; TotalRecordCount?: number }>(user, "/Items", {
        IncludeItemTypes: "Audio", Recursive: "true", EnableUserData: "false",
        Fields: "Genres,DateCreated,MediaStreams,PlayAccess", SortBy: "SortName", EnableTotalRecordCount: "true",
        StartIndex: String(offset), Limit: String(limit),
      });
      if (!Array.isArray(page.Items)) throw new Error("Invalid Jellyfin Items");
      for (const item of page.Items) {
        const id = itemId(item.Id);
        if (!id || !isPlayable(item) || seen.has(id)) continue;
        seen.add(id);
        addTrack(albums, item, id);
      }
      offset += page.Items.length;
      if (!page.Items.length || (page.TotalRecordCount != null && offset >= page.TotalRecordCount)) break;
    }
  } catch (error) {
    if (error instanceof MusicAccessError && error.status === 403) return empty;
    throw error;
  }
  for (const album of albums.values()) {
    album.tracks.sort((a, b) => a.disc - b.disc || a.number - b.number || a.title.localeCompare(b.title));
  }
  return { configured, linked: true, albums: [...albums.values()].sort((a, b) => a.title.localeCompare(b.title)) };
}

export async function visibleAudioId(user: MusicUser, requestedId: string): Promise<string> {
  const id = itemId(requestedId);
  if (id) {
    // The single-item endpoint checks IsVisibleStandalone for this user. In Jellyfin 10.11,
    // a batch query with Ids alone skips library-root filtering and can return another folder's tracks.
    const item = await musicJson<AudioItem>(user, `/Items/${id}`, {});
    if (itemId(item.Id) === id && isPlayable(item)) return id;
  }
  throw new MusicAccessError(404, "Трек недоступен");
}

export function fetchOriginalAudio(user: MusicUser, id: string, method: string, headers: Record<string, string>, signal: AbortSignal) {
  const url = new URL(`${config.media.jellyfin.url}/Audio/${id}/stream`);
  url.searchParams.set("static", "true");
  return fetch(url, {
    method, headers: { ...jellyfinUserHeaders(user.token), "Accept-Encoding": "identity", ...headers },
    signal, redirect: "error",
  });
}
