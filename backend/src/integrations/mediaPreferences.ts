import { prisma } from "../db/client.js";
import type { TmdbItem } from "./tmdb.js";

export type MediaPreferenceStatus = "watchlist" | "hidden" | "liked" | "disliked";

export interface MediaPreferenceInput {
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

function normalize(row: any): MediaPreferenceItem {
  return {
    id: row.id,
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

export async function listMediaPreferences(
  status?: MediaPreferenceStatus,
): Promise<MediaPreferenceItem[]> {
  const rows = await prisma.mediaPreference.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(normalize);
}

export async function upsertMediaPreference(input: MediaPreferenceInput): Promise<MediaPreferenceItem> {
  const row = await prisma.mediaPreference.upsert({
    where: { kind_tmdbId: { kind: input.kind, tmdbId: input.tmdbId } },
    create: {
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
  return normalize(row);
}

export async function removeMediaPreference(kind: "movie" | "series", tmdbId: number): Promise<void> {
  await prisma.mediaPreference.deleteMany({ where: { kind, tmdbId } });
}

export async function hiddenMediaKeys(): Promise<Set<string>> {
  const rows = await prisma.mediaPreference.findMany({
    where: { status: { in: ["hidden", "disliked"] } },
    select: { kind: true, tmdbId: true },
  });
  return new Set(rows.map((r) => `${r.kind}:${r.tmdbId}`));
}

export async function watchlistItems(): Promise<TmdbItem[]> {
  const rows = await listMediaPreferences("watchlist");
  return rows.map((r) => ({
    kind: r.kind,
    tmdbId: r.tmdbId,
    title: r.title,
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
