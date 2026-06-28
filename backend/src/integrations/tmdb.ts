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
  backdrop: string | null;
  genreIds: number[];
  genres: string[];
  runtime: number | null;
  episodeCount: number | null;
  trailerKey: string | null;
  trailerUrl: string | null;
  rating: number | null;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface DiscoverOpts {
  genreId?: number | string;
  year?: number | string;
  sort?: string;
  voteGte?: number;
  page?: number;
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
const imgOf = (p?: string | null): string | null => (p ? `${IMG}${p}` : null);

// Один TMDB-результат (movie/tv) → TmdbItem. person/прочее → null.
// Russian text приходит из language=ru-RU; пустой ru-title фолбэчим на original.
function mapItem(r: any, forceKind?: "movie" | "tv"): TmdbItem | null {
  const mt = forceKind ?? r.media_type;
  const genreIds: number[] = Array.isArray(r.genre_ids)
    ? r.genre_ids.map((g: any) => Number(g)).filter(Number.isFinite)
    : Array.isArray(r.genres)
      ? r.genres.map((g: any) => Number(g.id)).filter(Number.isFinite)
      : [];
  const genres: string[] = Array.isArray(r.genres)
    ? r.genres.map((g: any) => String(g.name ?? "")).filter(Boolean)
    : [];
  const trailer = pickTrailer(r.videos);
  if (mt === "movie") {
    return {
      kind: "movie",
      tmdbId: Number(r.id),
      title: String(r.title || r.original_title || "—"),
      year: yearOf(r.release_date),
      overview: String(r.overview ?? ""),
      poster: imgOf(r.poster_path),
      backdrop: imgOf(r.backdrop_path),
      genreIds,
      genres,
      runtime: Number.isFinite(Number(r.runtime)) ? Number(r.runtime) : null,
      episodeCount: null,
      trailerKey: trailer,
      trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer}` : null,
      rating: r.vote_average ? Number(r.vote_average) : null,
    };
  }
  if (mt === "tv") {
    return {
      kind: "series",
      tmdbId: Number(r.id),
      title: String(r.name || r.original_name || "—"),
      year: yearOf(r.first_air_date),
      overview: String(r.overview ?? ""),
      poster: imgOf(r.poster_path),
      backdrop: imgOf(r.backdrop_path),
      genreIds,
      genres,
      runtime: Array.isArray(r.episode_run_time) && r.episode_run_time[0] ? Number(r.episode_run_time[0]) : null,
      episodeCount: Number.isFinite(Number(r.number_of_episodes)) ? Number(r.number_of_episodes) : null,
      trailerKey: trailer,
      trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer}` : null,
      rating: r.vote_average ? Number(r.vote_average) : null,
    };
  }
  return null;
}

function pickTrailer(videos: any): string | null {
  const items = Array.isArray(videos?.results) ? videos.results : [];
  const yt = items.filter((v: any) => v?.site === "YouTube" && v?.key);
  const trailer =
    yt.find((v: any) => v.type === "Trailer" && v.official) ??
    yt.find((v: any) => v.type === "Trailer") ??
    yt[0];
  return trailer?.key ? String(trailer.key) : null;
}

const mapList = (data: any, forceKind?: "movie" | "tv", limit = 24): TmdbItem[] =>
  (Array.isArray(data?.results) ? data.results : [])
    .map((r: any) => mapItem(r, forceKind))
    .filter((x: TmdbItem | null): x is TmdbItem => x !== null)
    .slice(0, limit);

// Поиск по фильмам и сериалам (multi). Сериалы и фильмы вперемешку по релевантности.
export async function tmdbSearch(query: string): Promise<TmdbItem[]> {
  if (!query.trim()) return [];
  const data = await tmdbGet("/search/multi", { query, include_adult: "false", page: "1" });
  return mapList(data);
}

// Тренды недели (фильмы + сериалы) — для дискавери-подборок.
export async function tmdbTrending(): Promise<TmdbItem[]> {
  return mapList(await tmdbGet("/trending/all/week"));
}

// Популярное отдельно по типу (доп. подборки).
export async function tmdbPopular(kind: "movie" | "series"): Promise<TmdbItem[]> {
  const path = kind === "movie" ? "/movie/popular" : "/tv/popular";
  return mapList(await tmdbGet(path), kind === "movie" ? "movie" : "tv");
}

// tmdbId сериала → tvdbId (нужен для карточки сериала / Sonarr). null если нет.
export async function tmdbTvToTvdb(tmdbId: number): Promise<number | null> {
  const data = await tmdbGet(`/tv/${tmdbId}/external_ids`);
  const tvdb = Number(data?.tvdb_id);
  return Number.isFinite(tvdb) && tvdb > 0 ? tvdb : null;
}

// ─── Discover / жанры / похожие / коллекции (LAMPA-style подборки) ───

// Список жанров (ru-названия) по типу. Статичен → кешируем в модуле на 24ч.
const genreCache = new Map<string, { at: number; data: TmdbGenre[] }>();
export async function tmdbGenres(kind: "movie" | "series"): Promise<TmdbGenre[]> {
  const key = kind === "movie" ? "movie" : "tv";
  const hit = genreCache.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.data;
  const data = await tmdbGet(`/genre/${key}/list`);
  const list: TmdbGenre[] = (Array.isArray(data?.genres) ? data.genres : [])
    .map((g: any) => ({ id: Number(g.id), name: String(g.name ?? "") }))
    .filter((g: TmdbGenre) => Number.isFinite(g.id) && g.name);
  genreCache.set(key, { at: Date.now(), data: list });
  return list;
}

// Discover с фильтрами — рабочая лошадка жанровых/годовых рейлов и жанрового хаба.
export async function tmdbDiscover(
  kind: "movie" | "series",
  opts: DiscoverOpts = {},
): Promise<TmdbItem[]> {
  const tv = kind === "series";
  const sort = opts.sort || "popularity.desc";
  const allowedSorts = tv
    ? new Set(["popularity.desc", "vote_average.desc", "first_air_date.desc"])
    : new Set(["popularity.desc", "vote_average.desc", "primary_release_date.desc", "revenue.desc"]);
  const params: Record<string, string> = {
    sort_by: allowedSorts.has(sort) ? sort : "popularity.desc",
    include_adult: "false",
    page: String(opts.page ?? 1),
  };
  if (tv) params.include_null_first_air_dates = "false";
  if (opts.genreId != null && String(opts.genreId) !== "")
    params.with_genres = String(opts.genreId);
  if (opts.year != null && String(opts.year) !== "")
    params[tv ? "first_air_date_year" : "primary_release_year"] = String(opts.year);
  if (opts.voteGte != null) {
    params["vote_average.gte"] = String(opts.voteGte);
    params["vote_count.gte"] = "150"; // отсекаем мусор с одним голосом
  }
  const data = await tmdbGet(`/discover/${tv ? "tv" : "movie"}`, params);
  return mapList(data, tv ? "tv" : "movie", opts.page != null ? 40 : 24);
}

// Похожие/рекомендации (для рейла «Похожее»). recommendations лучше similar (LAMPA).
export async function tmdbSimilar(kind: "movie" | "series", tmdbId: number): Promise<TmdbItem[]> {
  const tv = kind === "series";
  try {
    const data = await tmdbGet(`/${tv ? "tv" : "movie"}/${tmdbId}/recommendations`);
    const rec = mapList(data, tv ? "tv" : "movie");
    if (rec.length) return rec;
  } catch {
    /* фолбэк ниже */
  }
  const data = await tmdbGet(`/${tv ? "tv" : "movie"}/${tmdbId}/similar`);
  return mapList(data, tv ? "tv" : "movie");
}

export async function tmdbDetails(kind: "movie" | "series", tmdbId: number): Promise<TmdbItem | null> {
  const tv = kind === "series";
  const data = await tmdbGet(`/${tv ? "tv" : "movie"}/${tmdbId}`, { append_to_response: "videos" });
  return mapItem(data, tv ? "tv" : "movie");
}

// tvdbId (Sonarr/Jellyfin) → TMDB tv id. ВАЖНО: TMDB tv id ≠ tvdbId.
export async function tmdbFindByTvdb(tvdbId: number): Promise<number | null> {
  const data = await tmdbGet(`/find/${tvdbId}`, { external_source: "tvdb_id" });
  const tv = Array.isArray(data?.tv_results) ? data.tv_results : [];
  const id = Number(tv[0]?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// Коллекция (франшиза) фильма: belongs_to_collection → /collection/{id}.
export async function tmdbMovieCollectionId(tmdbId: number): Promise<number | null> {
  const data = await tmdbGet(`/movie/${tmdbId}`);
  const id = Number(data?.belongs_to_collection?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function tmdbCollection(collectionId: number): Promise<{ name: string; items: TmdbItem[] }> {
  const data = await tmdbGet(`/collection/${collectionId}`);
  const items = (Array.isArray(data?.parts) ? data.parts : [])
    .map((r: any) => mapItem(r, "movie"))
    .filter((x: TmdbItem | null): x is TmdbItem => x !== null)
    .sort((a: TmdbItem, b: TmdbItem) => (a.year ?? 0) - (b.year ?? 0));
  return { name: String(data?.name ?? ""), items };
}

// Удобный резолвер франшизы по id фильма за один вызов.
export async function tmdbMovieCollection(tmdbId: number): Promise<{ name: string; items: TmdbItem[] } | null> {
  const cid = await tmdbMovieCollectionId(tmdbId);
  if (!cid) return null;
  return tmdbCollection(cid);
}

// Герой дискавери: топовый трендовый тайтл, обязательно с backdrop.
export async function tmdbHero(): Promise<TmdbItem | null> {
  const trending = await tmdbTrending();
  const withArt = trending.filter((t) => t.backdrop && (t.rating ?? 0) >= 6);
  const pool = withArt.length ? withArt : trending.filter((t) => t.backdrop);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * Math.min(pool.length, 10))];
}
