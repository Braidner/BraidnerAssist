// Discovery-агрегатор (LAMPA/ZONA-style подборки). Собирает домашнюю страницу дискавери
// из TMDB (жанры/годы/тренды/рейтинг) одним вызовом, плюс «похожее», франшизы и
// персональное «потому что вы смотрели» (seed строго из Jellyfin ProviderIds).
// Всё изолировано через Promise.allSettled — падение одного рейла не ломает страницу.

import { config } from "../config.js";
import {
  tmdbDiscover,
  tmdbTrending,
  tmdbGenres,
  tmdbSimilar,
  tmdbFindByTvdb,
  tmdbMovieCollection,
  tmdbHero,
  tmdbDetails,
  type TmdbItem,
  type TmdbGenre,
} from "./tmdb.js";
import { getLibrary, getRecentlyWatchedSeeds, type LibraryItem } from "./media.js";
import { hiddenMediaKeys, watchlistItems } from "./mediaPreferences.js";

export interface DiscoverRail {
  key: string;
  label: string;
  kind: "movie" | "series" | "mixed";
  items: TmdbItem[];
}

export interface DiscoverHome {
  configured: boolean;
  hero: TmdbItem | null;
  genres: { movie: TmdbGenre[]; series: TmdbGenre[] };
  rails: DiscoverRail[];
}

// Курируемые жанровые рейлы домашней страницы (id жанров TMDB фиксированы).
const HOME_MOVIE_GENRES: { id: number; label: string }[] = [
  { id: 28, label: "Боевики" },
  { id: 35, label: "Комедии" },
  { id: 18, label: "Драмы" },
  { id: 878, label: "Фантастика" },
  { id: 27, label: "Ужасы" },
  { id: 16, label: "Мультфильмы" },
];

const settled = <T,>(r: PromiseSettledResult<T>, fb: T): T =>
  r.status === "fulfilled" ? r.value : fb;

// Ключ дедупликации тайтла против библиотеки/других рейлов.
const tmdbKey = (i: TmdbItem) => `${i.kind}:${i.tmdbId}`;

function libraryTmdbIds(lib: LibraryItem[]): Set<number> {
  const s = new Set<number>();
  for (const it of lib) if (it.tmdbId) s.add(it.tmdbId);
  return s;
}

const filterItems = (
  items: TmdbItem[],
  hidden: Set<string>,
  used?: Set<string>,
): TmdbItem[] => {
  const seen = used ?? new Set<string>();
  return items.filter((i) => {
    const k = tmdbKey(i);
    if (hidden.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// Домашняя страница дискавери. Graceful: TMDB выключен → configured:false, пустые рейлы.
export async function getDiscoverHome(): Promise<DiscoverHome> {
  if (!config.media.tmdb.configured) {
    return { configured: false, hero: null, genres: { movie: [], series: [] }, rails: [] };
  }
  const year = new Date().getFullYear();
  const [
    heroR, trendR, topRatedR, freshR, popTvR, gMovieR, gTvR, watchlistR, hiddenR,
    ...genreRailsR
  ] = await Promise.allSettled([
    tmdbHero(),
    tmdbTrending(),
    tmdbDiscover("movie", { sort: "vote_average.desc", voteGte: 7 }),
    tmdbDiscover("movie", { year, sort: "popularity.desc" }),
    tmdbDiscover("series", { sort: "popularity.desc" }),
    tmdbGenres("movie"),
    tmdbGenres("series"),
    watchlistItems(),
    hiddenMediaKeys(),
    ...HOME_MOVIE_GENRES.map((g) => tmdbDiscover("movie", { genreId: g.id })),
  ]);

  const rails: DiscoverRail[] = [];
  const hidden = settled(hiddenR, new Set<string>());
  const used = new Set<string>();
  const push = (key: string, label: string, kind: DiscoverRail["kind"], items: TmdbItem[]) => {
    const filtered = filterItems(items, hidden, used);
    if (filtered.length) rails.push({ key, label, kind, items: filtered });
  };

  push("watchlist", "Мой список", "mixed", settled(watchlistR, []));
  push("trending", "В тренде", "mixed", settled(trendR, []));
  push("top", "Топ рейтинг", "movie", settled(topRatedR, []));
  push("fresh", `Новинки ${year}`, "movie", settled(freshR, []));
  push("series", "Популярные сериалы", "series", settled(popTvR, []));
  genreRailsR.forEach((r, i) => {
    const g = HOME_MOVIE_GENRES[i];
    push(`g${g.id}`, g.label, "movie", settled(r, []));
  });

  return {
    configured: true,
    hero: (() => {
      const hero = settled(heroR, null);
      return hero && !hidden.has(tmdbKey(hero)) ? hero : null;
    })(),
    genres: { movie: settled(gMovieR, []), series: settled(gTvR, []) },
    rails,
  };
}

// «Потому что вы смотрели»: seed из недавно просмотренного (Jellyfin ProviderIds),
// для каждого — рейл похожих, дедуп против библиотеки и между рейлами.
export async function getBecauseRails(): Promise<DiscoverRail[]> {
  if (!config.media.tmdb.configured) return [];
  const [seedsR, libR] = await Promise.allSettled([
    getRecentlyWatchedSeeds(6),
    getLibrary(),
  ]);
  const hidden = await hiddenMediaKeys().catch(() => new Set<string>());
  const seeds = settled(seedsR, []);
  const inLib = libraryTmdbIds(settled(libR, []));
  const used = new Set<string>();

  const rails = await Promise.allSettled(
    seeds.map(async (seed): Promise<DiscoverRail | null> => {
      let tmdbId = seed.tmdbId;
      if (!tmdbId && seed.kind === "series" && seed.tvdbId) {
        tmdbId = await tmdbFindByTvdb(seed.tvdbId);
      }
      if (!tmdbId) return null;
      const similar = await tmdbSimilar(seed.kind, tmdbId);
      const items = similar.filter((i) => {
        if (hidden.has(tmdbKey(i))) return false;
        if (i.tmdbId && inLib.has(i.tmdbId)) return false;
        const k = tmdbKey(i);
        if (used.has(k)) return false;
        used.add(k);
        return true;
      });
      if (items.length < 3) return null;
      return {
        key: `because-${seed.kind}-${tmdbId}`,
        label: `Потому что вы смотрели «${seed.title}»`,
        kind: seed.kind,
        items,
      };
    }),
  );

  return rails
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is DiscoverRail => r !== null)
    .slice(0, 4);
}

// Рейл «Похожее» для детальной страницы. Для сериала на входе может быть tvdbId —
// тогда резолвим в TMDB tv id (TMDB tv id ≠ tvdbId!).
export async function getSimilarRail(
  kind: "movie" | "series",
  id: number,
  idType: "tmdb" | "tvdb" = "tmdb",
): Promise<TmdbItem[]> {
  if (!config.media.tmdb.configured) return [];
  let tmdbId: number | null = id;
  if (idType === "tvdb" && kind === "series") tmdbId = await tmdbFindByTvdb(id);
  if (!tmdbId) return [];
  return tmdbSimilar(kind, tmdbId);
}

export async function getTmdbDetail(kind: "movie" | "series", id: number, idType: "tmdb" | "tvdb" = "tmdb"): Promise<TmdbItem | null> {
  let tmdbId: number | null = id;
  if (idType === "tvdb" && kind === "series") tmdbId = await tmdbFindByTvdb(id);
  if (!tmdbId) return null;
  return tmdbDetails(kind, tmdbId);
}

// Рейл франшизы (коллекции) для фильма по tmdbId. null если фильм не в коллекции.
export async function getCollectionRail(
  tmdbId: number,
): Promise<{ name: string; items: TmdbItem[] } | null> {
  if (!config.media.tmdb.configured) return null;
  return tmdbMovieCollection(tmdbId);
}
