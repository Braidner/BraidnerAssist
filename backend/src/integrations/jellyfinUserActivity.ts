import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { listJellyfinUsers, type JellyfinUserRef } from "./jellyfinUsers.js";
import {
  buildDownloadQuotaSnapshot,
  type DownloadQuotaSnapshot,
  type DownloadQuotaSource,
} from "./downloadQuota.js";

const ONLINE_WINDOW_MS = 5 * 60_000;
const HISTORY_LIMIT = 8;

export interface JellyfinHistoryItem {
  id: string;
  imageItemId: string;
  name: string;
  seriesName: string | null;
  type: "Movie" | "Episode" | string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  playedAt: string;
  played: boolean;
  progressPct: number | null;
  playCount: number;
  runtimeMinutes: number | null;
}

export interface JellyfinNowPlaying {
  sessionId: string;
  itemId: string;
  imageItemId: string;
  name: string;
  seriesName: string | null;
  type: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  deviceName: string;
  client: string;
  paused: boolean;
  muted: boolean;
  progressPct: number | null;
  bitrate: number | null;
  playMethod: "Transcode" | "DirectStream" | "DirectPlay";
  resolution: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
}

export interface JellyfinUserActivity {
  id: string;
  appUserId: string | null;
  jellyfinUserId: string | null;
  username: string;
  displayName: string;
  role: string | null;
  linked: boolean;
  active: boolean;
  online: boolean;
  lastSeenAt: string | null;
  devices: Array<{ name: string; client: string }>;
  liveBitrate: number;
  nowPlaying: JellyfinNowPlaying[];
  history: JellyfinHistoryItem[];
  quota: DownloadQuotaSnapshot | null;
}

export interface JellyfinUserActivityData {
  configured: boolean;
  updatedAt: string;
  summary: {
    users: number;
    online: number;
    watching: number;
    liveBitrate: number;
  };
  users: JellyfinUserActivity[];
}

export interface JellyfinSessionDto {
  Id?: string;
  UserId?: string;
  UserName?: string;
  Client?: string;
  DeviceName?: string;
  IsActive?: boolean;
  LastActivityDate?: string;
  NowPlayingItem?: {
    Id?: string;
    Name?: string;
    SeriesName?: string;
    SeriesId?: string;
    Type?: string;
    ParentIndexNumber?: number;
    IndexNumber?: number;
    RunTimeTicks?: number;
    Bitrate?: number;
    MediaSources?: Array<{
      Id?: string;
      Bitrate?: number;
      MediaStreams?: Array<{
        Type?: string;
        Width?: number;
        Height?: number;
        Codec?: string;
      }>;
    }>;
  };
  PlayState?: {
    PositionTicks?: number;
    IsPaused?: boolean;
    IsMuted?: boolean;
    PlayMethod?: string;
    MediaSourceId?: string;
  };
  TranscodingInfo?: {
    Bitrate?: number;
    Width?: number;
    Height?: number;
    VideoCodec?: string;
    AudioCodec?: string;
  };
}

export interface JellyfinHistoryItemDto {
  Id?: string;
  Name?: string;
  SeriesName?: string;
  SeriesId?: string;
  Type?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  RunTimeTicks?: number;
  UserData?: {
    LastPlayedDate?: string;
    Played?: boolean;
    PlayedPercentage?: number;
    PlayCount?: number;
  };
}

interface AppUserActivitySource extends DownloadQuotaSource {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  active: boolean;
  jellyfinUserId: string | null;
}

interface BuildActivityInput {
  appUsers: AppUserActivitySource[];
  jellyfinUsers: JellyfinUserRef[];
  sessions: JellyfinSessionDto[];
  historyByUserId: Record<string, JellyfinHistoryItemDto[]>;
  now?: Date;
}

function jfHeaders(): Record<string, string> {
  return { "X-Emby-Token": config.media.jellyfin.apiKey! };
}

async function jfFetch(path: string): Promise<Response> {
  return fetch(`${config.media.jellyfin.url}${path}`, {
    headers: jfHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
}

function finiteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function isSessionOnline(session: JellyfinSessionDto, now: Date): boolean {
  if (session.NowPlayingItem || session.IsActive) return true;
  const lastActivity = session.LastActivityDate
    ? Date.parse(session.LastActivityDate)
    : Number.NaN;
  return Number.isFinite(lastActivity) && now.getTime() - lastActivity <= ONLINE_WINDOW_MS;
}

function sessionBitrate(session: JellyfinSessionDto): number | null {
  const mediaSource = session.NowPlayingItem?.MediaSources?.find(
    (source) => source.Id === session.PlayState?.MediaSourceId,
  ) ?? session.NowPlayingItem?.MediaSources?.[0];
  return finiteNumber(
    session.TranscodingInfo?.Bitrate,
    mediaSource?.Bitrate,
    session.NowPlayingItem?.Bitrate,
  );
}

function sessionResolution(session: JellyfinSessionDto): string | null {
  const mediaSource = session.NowPlayingItem?.MediaSources?.find(
    (source) => source.Id === session.PlayState?.MediaSourceId,
  ) ?? session.NowPlayingItem?.MediaSources?.[0];
  const videoStream = mediaSource?.MediaStreams?.find((stream) => stream.Type === "Video");
  const width = finiteNumber(session.TranscodingInfo?.Width, videoStream?.Width);
  const height = finiteNumber(session.TranscodingInfo?.Height, videoStream?.Height);
  return width && height ? `${width}×${height}` : null;
}

function mapNowPlaying(session: JellyfinSessionDto): JellyfinNowPlaying | null {
  const item = session.NowPlayingItem;
  if (!item?.Id) return null;
  const runtime = finiteNumber(item.RunTimeTicks);
  const position = finiteNumber(session.PlayState?.PositionTicks) ?? 0;
  const progressPct = runtime
    ? Math.max(0, Math.min(100, Math.round((position / runtime) * 100)))
    : null;
  const playMethod = session.TranscodingInfo
    ? "Transcode"
    : session.PlayState?.PlayMethod === "DirectStream"
      ? "DirectStream"
      : "DirectPlay";
  const mediaSource = item.MediaSources?.find(
    (source) => source.Id === session.PlayState?.MediaSourceId,
  ) ?? item.MediaSources?.[0];
  const videoStream = mediaSource?.MediaStreams?.find((stream) => stream.Type === "Video");
  const audioStream = mediaSource?.MediaStreams?.find((stream) => stream.Type === "Audio");

  return {
    sessionId: session.Id ?? `${session.UserId ?? "user"}-${item.Id}`,
    itemId: item.Id,
    imageItemId: item.SeriesId ?? item.Id,
    name: item.Name?.trim() || "Без названия",
    seriesName: item.SeriesName?.trim() || null,
    type: item.Type ?? "Video",
    seasonNumber: Number.isFinite(item.ParentIndexNumber) ? item.ParentIndexNumber! : null,
    episodeNumber: Number.isFinite(item.IndexNumber) ? item.IndexNumber! : null,
    deviceName: session.DeviceName?.trim() || "Неизвестное устройство",
    client: session.Client?.trim() || "Jellyfin",
    paused: Boolean(session.PlayState?.IsPaused),
    muted: Boolean(session.PlayState?.IsMuted),
    progressPct,
    bitrate: sessionBitrate(session),
    playMethod,
    resolution: sessionResolution(session),
    videoCodec: session.TranscodingInfo?.VideoCodec ?? videoStream?.Codec ?? null,
    audioCodec: session.TranscodingInfo?.AudioCodec ?? audioStream?.Codec ?? null,
  };
}

function mapHistory(items: JellyfinHistoryItemDto[]): JellyfinHistoryItem[] {
  return items
    .filter((item) => item.Id && item.UserData?.LastPlayedDate)
    .sort(
      (a, b) =>
        Date.parse(b.UserData!.LastPlayedDate!) -
        Date.parse(a.UserData!.LastPlayedDate!),
    )
    .slice(0, HISTORY_LIMIT)
    .map((item) => ({
      id: item.Id!,
      imageItemId: item.SeriesId ?? item.Id!,
      name: item.Name?.trim() || "Без названия",
      seriesName: item.SeriesName?.trim() || null,
      type: item.Type ?? "Video",
      seasonNumber: Number.isFinite(item.ParentIndexNumber) ? item.ParentIndexNumber! : null,
      episodeNumber: Number.isFinite(item.IndexNumber) ? item.IndexNumber! : null,
      playedAt: item.UserData!.LastPlayedDate!,
      played: Boolean(item.UserData?.Played),
      progressPct: finiteNumber(item.UserData?.PlayedPercentage),
      playCount: Math.max(0, Number(item.UserData?.PlayCount ?? 0)),
      runtimeMinutes: item.RunTimeTicks
        ? Math.max(1, Math.round(item.RunTimeTicks / 600_000_000))
        : null,
    }));
}

export function buildJellyfinUserActivity(input: BuildActivityInput): JellyfinUserActivityData {
  const now = input.now ?? new Date();
  const jellyfinById = new Map(input.jellyfinUsers.map((user) => [user.id, user]));
  const linkedIds = new Set(
    input.appUsers.flatMap((user) => user.jellyfinUserId ? [user.jellyfinUserId] : []),
  );

  const profiles: Array<{
    id: string;
    appUserId: string | null;
    jellyfinUserId: string | null;
    username: string;
    displayName: string;
    role: string | null;
    active: boolean;
    linked: boolean;
    quota: DownloadQuotaSnapshot | null;
  }> = [
    ...input.appUsers.map((user) => {
      const jellyfinUser = user.jellyfinUserId
        ? jellyfinById.get(user.jellyfinUserId)
        : null;
      return {
        id: `app:${user.id}`,
        appUserId: user.id,
        jellyfinUserId: user.jellyfinUserId,
        username: user.username,
        displayName: user.displayName?.trim() || user.username,
        role: user.role,
        active: user.active,
        linked: Boolean(jellyfinUser),
        quota: buildDownloadQuotaSnapshot(user, now),
      };
    }),
    ...input.jellyfinUsers
      .filter((user) => !linkedIds.has(user.id))
      .map((user) => ({
        id: `jellyfin:${user.id}`,
        appUserId: null,
        jellyfinUserId: user.id,
        username: user.name,
        displayName: user.name,
        role: null,
        active: true,
        linked: false,
        quota: null,
      })),
  ];

  const users = profiles.map<JellyfinUserActivity>((profile) => {
    const userSessions = profile.jellyfinUserId
      ? input.sessions.filter((session) => session.UserId === profile.jellyfinUserId)
      : [];
    const visibleSessions = userSessions.filter((session) => isSessionOnline(session, now));
    const nowPlaying = visibleSessions
      .map(mapNowPlaying)
      .filter((item): item is JellyfinNowPlaying => Boolean(item));
    const lastSeenAt = userSessions
      .map((session) => session.LastActivityDate)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    const devices = Array.from(
      new Map(
        visibleSessions.map((session) => {
          const name = session.DeviceName?.trim() || "Неизвестное устройство";
          const client = session.Client?.trim() || "Jellyfin";
          return [`${name}\u0000${client}`, { name, client }] as const;
        }),
      ).values(),
    );

    return {
      ...profile,
      online: visibleSessions.length > 0,
      lastSeenAt,
      devices,
      liveBitrate: nowPlaying.reduce((sum, item) => sum + (item.bitrate ?? 0), 0),
      nowPlaying,
      history: profile.jellyfinUserId
        ? mapHistory(input.historyByUserId[profile.jellyfinUserId] ?? [])
        : [],
    };
  }).sort((a, b) => {
    const rank = (user: JellyfinUserActivity) =>
      user.nowPlaying.length ? 0 : user.online ? 1 : 2;
    return rank(a) - rank(b) || a.displayName.localeCompare(b.displayName, "ru");
  });

  return {
    configured: true,
    updatedAt: now.toISOString(),
    summary: {
      users: users.length,
      online: users.filter((user) => user.online).length,
      watching: users.filter((user) => user.nowPlaying.length > 0).length,
      liveBitrate: users.reduce((sum, user) => sum + user.liveBitrate, 0),
    },
    users,
  };
}

async function fetchSessions(): Promise<JellyfinSessionDto[]> {
  const response = await jfFetch("/Sessions");
  if (!response.ok) throw new Error(`Jellyfin /Sessions responded ${response.status}`);
  return (await response.json()) as JellyfinSessionDto[];
}

async function fetchHistory(userId: string): Promise<JellyfinHistoryItemDto[]> {
  const params = new URLSearchParams({
    Recursive: "true",
    SortBy: "DatePlayed",
    SortOrder: "Descending",
    Limit: "40",
    IncludeItemTypes: "Movie,Episode",
    Fields: "SeriesName,SeriesId,ParentIndexNumber,IndexNumber,UserData,RunTimeTicks,ProductionYear",
    EnableUserData: "true",
  });
  const response = await jfFetch(`/Users/${encodeURIComponent(userId)}/Items?${params}`);
  if (!response.ok) {
    throw new Error(`Jellyfin user history responded ${response.status}`);
  }
  const body = (await response.json()) as { Items?: JellyfinHistoryItemDto[] };
  return body.Items ?? [];
}

export async function getJellyfinUserActivity(): Promise<JellyfinUserActivityData> {
  const updatedAt = new Date().toISOString();
  if (!config.media.jellyfin.configured) {
    return {
      configured: false,
      updatedAt,
      summary: { users: 0, online: 0, watching: 0, liveBitrate: 0 },
      users: [],
    };
  }

  const [appUsers, jellyfinUsers, sessions] = await Promise.all([
    prisma.appUser.findMany({
      where: { approvalStatus: "approved" },
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        active: true,
        jellyfinUserId: true,
        downloadLimitTotal: true,
        downloadLimitDaily: true,
        downloadLimitWeekly: true,
        downloadTotalResetAt: true,
        downloadDailyResetAt: true,
        downloadWeeklyResetAt: true,
        downloads: { select: { addedAt: true } },
      },
    }),
    listJellyfinUsers(),
    fetchSessions(),
  ]);

  const historyEntries = await Promise.all(
    jellyfinUsers.map(async (user) => {
      const history = await fetchHistory(user.id).catch(() => []);
      return [user.id, history] as const;
    }),
  );

  return buildJellyfinUserActivity({
    appUsers,
    jellyfinUsers,
    sessions,
    historyByUserId: Object.fromEntries(historyEntries),
    now: new Date(updatedAt),
  });
}
