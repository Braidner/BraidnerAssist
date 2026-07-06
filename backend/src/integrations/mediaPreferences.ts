import { prisma } from "../db/client.js";
import type { TmdbItem } from "./tmdb.js";

export type MediaPreferenceStatus = "watchlist" | "hidden" | "liked" | "disliked";

export interface MediaPreferenceInput {
  appUserId?: string | null;
  kind: "movie" | "series";
  tmdbId: number;
  tvdbId?: number | null;
  status: MediaPreferenceStatus;
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  year?: number | null;
  overview?: string | null;
  rating?: number | null;
}

export interface MediaPreferenceItem {
  id: string;
  appUserId: string;
  kind: "movie" | "series";
  tmdbId: number;
  tvdbId: number | null;
  status: MediaPreferenceStatus;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: number | null;
  overview: string;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizeMediaPreference(row: any): MediaPreferenceItem {
  return {
    id: row.id,
    appUserId: row.appUserId ?? "global",
    kind: row.kind === "series" ? "series" : "movie",
    tmdbId: row.tmdbId,
    tvdbId: row.tvdbId ?? null,
    status: row.status as MediaPreferenceStatus,
    title: row.title,
    poster: row.poster ?? null,
    backdrop: row.backdrop ?? null,
    year: row.year ?? null,
    overview: row.overview ?? "",
    rating: row.rating ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mediaPreferenceOwner(appUserId?: string | null): string {
  return appUserId && appUserId !== "app-token" ? appUserId : "global";
}

export async function listMediaPreferences(
  status?: MediaPreferenceStatus,
  appUserId?: string | null,
): Promise<MediaPreferenceItem[]> {
  const owner = mediaPreferenceOwner(appUserId);
  const rows = await prisma.mediaPreference.findMany({
    where: { appUserId: { in: owner === "global" ? ["global"] : ["global", owner] } },
    orderBy: { updatedAt: "desc" },
  });
  return effectiveMediaPreferences(rows.map(normalizeMediaPreference), owner, status);
}

export function effectiveMediaPreferences(
  rows: MediaPreferenceItem[],
  owner: string,
  status?: MediaPreferenceStatus,
): MediaPreferenceItem[] {
  const effective = new Map<string, MediaPreferenceItem>();
  for (const row of rows.sort((a, b) => {
    if (a.appUserId === b.appUserId) return b.updatedAt.getTime() - a.updatedAt.getTime();
    return a.appUserId === owner ? -1 : 1;
  })) {
    const key = `${row.kind}:${row.tmdbId}`;
    if (!effective.has(key)) effective.set(key, row);
  }
  return [...effective.values()]
    .filter((row) => !status || row.status === status)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function upsertMediaPreference(input: MediaPreferenceInput): Promise<MediaPreferenceItem> {
  const appUserId = mediaPreferenceOwner(input.appUserId);
  const row = await prisma.mediaPreference.upsert({
    where: { appUserId_kind_tmdbId: { appUserId, kind: input.kind, tmdbId: input.tmdbId } },
    create: {
      appUserId,
      kind: input.kind,
      tmdbId: input.tmdbId,
      tvdbId: input.tvdbId ?? null,
      status: input.status,
      title: input.title,
      poster: input.poster ?? null,
      backdrop: input.backdrop ?? null,
      year: input.year ?? null,
      overview: input.overview ?? null,
      rating: input.rating ?? null,
    },
    update: {
      appUserId,
      tvdbId: input.tvdbId ?? null,
      status: input.status,
      title: input.title,
      poster: input.poster ?? null,
      backdrop: input.backdrop ?? null,
      year: input.year ?? null,
      overview: input.overview ?? null,
      rating: input.rating ?? null,
    },
  });
  return normalizeMediaPreference(row);
}

export async function removeMediaPreference(kind: "movie" | "series", tmdbId: number, appUserId?: string | null): Promise<void> {
  await prisma.mediaPreference.deleteMany({ where: { appUserId: mediaPreferenceOwner(appUserId), kind, tmdbId } });
}

export async function hiddenMediaKeys(appUserId?: string | null): Promise<Set<string>> {
  const rows = await listMediaPreferences(undefined, appUserId);
  return new Set(
    rows
      .filter((r) => r.status === "hidden" || r.status === "disliked")
      .map((r) => `${r.kind}:${r.tmdbId}`),
  );
}

export async function watchlistItems(appUserId?: string | null): Promise<TmdbItem[]> {
  const rows = await listMediaPreferences("watchlist", appUserId);
  return rows.map((r) => ({
    kind: r.kind,
    tmdbId: r.tmdbId,
    title: r.title,
    originalTitle: null,
    year: r.year,
    overview: r.overview,
    poster: r.poster,
    backdrop: r.backdrop,
    genreIds: [],
    genres: [],
    runtime: null,
    episodeCount: null,
    trailerKey: null,
    trailerUrl: null,
    rating: r.rating,
  }));
}
