// TMDB — метаданные и дискавери напрямую (Media v2), без Sonarr/Radarr.
// v3 API (api_key в query). Опционален: не задан TMDB_API_KEY → пустые ответы.
// Постеры отдаём полным URL image.tmdb.org — фронт тащит их через /api/poster
// (анти-SSRF разрешает этот хост, даунсайзит original→w342).

import { config } from "../config.js";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/original";

export interface TmdbItem {
  kind: "movie" | "series";
  tmdbId: number;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  rating: number | null;
}

function cfg() {
  return config.media.tmdb;
}

async function tmdbGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const c = cfg();
  if (!c.configured) throw new Error("TMDB не настроен");
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", c.apiKey!);
  url.searchParams.set("language", "ru-RU");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`TMDB ${path} ${res.status}`);
  return res.json();
}

const yearOf = (d?: string): number | null => (d && d.length >= 4 ? Number(d.slice(0, 4)) : null);
const posterOf = (p?: string | null): string | null => (p ? `${IMG}${p}` : null);

// Один TMDB-результат (movie/tv) → TmdbItem. person/прочее → null.
function mapItem(r: any, forceKind?: "movie" | "tv"): TmdbItem | null {
  const mt = forceKind ?? r.media_type;
  if (mt === "movie") {
    return {
      kind: "movie",
      tmdbId: Number(r.id),
      title: String(r.title ?? r.original_title ?? "—"),
      year: yearOf(r.release_date),
      overview: String(r.overview ?? ""),
      poster: posterOf(r.poster_path),
      rating: r.vote_average ? Number(r.vote_average) : null,
    };
  }
  if (mt === "tv") {
    return {
      kind: "series",
      tmdbId: Number(r.id),
      title: String(r.name ?? r.original_name ?? "—"),
      year: yearOf(r.first_air_date),
      overview: String(r.overview ?? ""),
      poster: posterOf(r.poster_path),
      rating: r.vote_average ? Number(r.vote_average) : null,
    };
  }
  return null;
}

// Поиск по фильмам и сериалам (multi). Сериалы и фильмы вперемешку по релевантности.
export async function tmdbSearch(query: string): Promise<TmdbItem[]> {
  if (!query.trim()) return [];
  const data = await tmdbGet("/search/multi", { query, include_adult: "false", page: "1" });
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((r: any) => mapItem(r)).filter((x: TmdbItem | null): x is TmdbItem => x !== null).slice(0, 24);
}

// Тренды недели (фильмы + сериалы) — для дискавери-подборок.
export async function tmdbTrending(): Promise<TmdbItem[]> {
  const data = await tmdbGet("/trending/all/week");
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((r: any) => mapItem(r)).filter((x: TmdbItem | null): x is TmdbItem => x !== null).slice(0, 24);
}

// Популярное отдельно по типу (доп. подборки).
export async function tmdbPopular(kind: "movie" | "series"): Promise<TmdbItem[]> {
  const path = kind === "movie" ? "/movie/popular" : "/tv/popular";
  const data = await tmdbGet(path);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((r: any) => mapItem(r, kind === "movie" ? "movie" : "tv"))
    .filter((x: TmdbItem | null): x is TmdbItem => x !== null)
    .slice(0, 24);
}

// tmdbId сериала → tvdbId (нужен для карточки сериала / Sonarr). null если нет.
export async function tmdbTvToTvdb(tmdbId: number): Promise<number | null> {
  const data = await tmdbGet(`/tv/${tmdbId}/external_ids`);
  const tvdb = Number(data?.tvdb_id);
  return Number.isFinite(tvdb) && tvdb > 0 ? tvdb : null;
}
