// Жанровый хаб (/media/discover/genre/:kind/:genreId) — ZONA-style каталог:
// сетка тайтлов из TMDB Discover с фильтрами по году и сортировке + бесконечный скролл.

import {useEffect, useRef, useState, useCallback} from "react";
import {useLocation, useParams, useNavigate, useSearchParams} from "react-router-dom";
import {
    getDiscoverGenre,
    getDiscoverGenres,
    tmdbResolveTvdb,
    posterUrl,
    type TmdbItem,
    type Genre,
    type MediaData,
} from "@/lib/api.ts";
import {cn} from "../../lib/cn.ts";
import {media as ms} from "./shared/mediaStyles.ts";
import {DetailTopBar} from "./shared/mediaDetail.tsx";

const MOVIE_SORTS: {value: string; label: string}[] = [
    {value: "popularity.desc", label: "Популярные"},
    {value: "vote_average.desc", label: "По рейтингу"},
    {value: "primary_release_date.desc", label: "Новинки"},
    {value: "revenue.desc", label: "По кассе"},
];

const SERIES_SORTS: {value: string; label: string}[] = [
    {value: "popularity.desc", label: "Популярные"},
    {value: "vote_average.desc", label: "По рейтингу"},
    {value: "first_air_date.desc", label: "Новинки"},
];

const YEARS: number[] = (() => {
    const now = new Date().getFullYear();
    return Array.from({length: now - 1979}, (_, i) => now - i);
})();

export function MediaGenrePage({media}: {media: MediaData}) {
    const {kind: kindParam = "movie", genreId = ""} = useParams();
    const kind: "movie" | "series" = kindParam === "series" ? "series" : "movie";
    const gid = Number(genreId);
    const nav = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const sorts = kind === "series" ? SERIES_SORTS : MOVIE_SORTS;
    const urlSort = searchParams.get("sort") ?? "popularity.desc";
    const urlYear = searchParams.get("year") ?? "";
    const normalizedSort = sorts.some((s) => s.value === urlSort) ? urlSort : "popularity.desc";

    const [items, setItems] = useState<TmdbItem[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [genres, setGenres] = useState<Genre[]>([]);
    const sentinel = useRef<HTMLDivElement | null>(null);
    const requestSeq = useRef(0);

    // Имя жанра для заголовка (из общего эндпоинта жанров).
    useEffect(() => {
        if (!media.tmdb) return;
        getDiscoverGenres(kind).then(setGenres);
    }, [media.tmdb, kind]);

    const genreName = genres.find((g) => g.id === gid)?.name ?? "Жанр";

    // Сброс при смене фильтров/жанра/типа.
    useEffect(() => {
        if (normalizedSort !== urlSort) {
            const next = new URLSearchParams(searchParams);
            next.set("sort", normalizedSort);
            setSearchParams(next, {replace: true});
        }
    }, [normalizedSort, searchParams, setSearchParams, urlSort]);

    useEffect(() => {
        setItems([]);
        setPage(1);
        setDone(false);
        setError(null);
        requestSeq.current += 1;
    }, [kind, gid, urlYear, normalizedSort]);

    const loadPage = useCallback(async (targetPage: number, replace = false) => {
        if ((loading && !replace) || (done && !replace) || !media.tmdb || !gid) return;
        const seq = ++requestSeq.current;
        setLoading(true);
        setError(null);
        const batch = await getDiscoverGenre(kind, gid, {
            year: urlYear || undefined,
            sort: normalizedSort,
            page: targetPage,
        });
        if (seq !== requestSeq.current) return;
        setItems((prev) => {
            const base = replace ? [] : prev;
            const seen = new Set(base.map((p) => p.kind + p.tmdbId));
            return [...base, ...batch.filter((b) => !seen.has(b.kind + b.tmdbId))];
        });
        if (batch.length === 0) setDone(true);
        if (targetPage === 1 && batch.length === 0) setError(null);
        setLoading(false);
    }, [kind, gid, urlYear, normalizedSort, loading, done, media.tmdb]);

    useEffect(() => {
        void loadPage(page, page === 1);
    }, [page, loadPage]);

    // Бесконечный скролл через IntersectionObserver.
    useEffect(() => {
        const el = sentinel.current;
        if (!el) return;
        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !loading && !done) setPage((p) => p + 1);
        }, {rootMargin: "600px"});
        io.observe(el);
        return () => io.disconnect();
    }, [loading, done]);

    const open = (it: TmdbItem) => {
        const from = `${location.pathname}${location.search}`;
        if (it.kind === "movie") nav(`/media/discover/movie/${it.tmdbId}`, {state: {from}});
        else tmdbResolveTvdb(it.tmdbId).then((tvdb) => tvdb && nav(`/media/discover/series/${tvdb}`, {state: {from}}));
    };

    const setFilter = (key: "sort" | "year", value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value);
        else next.delete(key);
        setSearchParams(next, {replace: true});
    };

    const resetFilters = () => {
        setSearchParams({}, {replace: true});
    };

    return (
        <div className={ms.page}>
            <DetailTopBar title={genreName} onBack={() => nav("/media/discover")} onQueueClick={() => nav("/media/system")}/>
            <div className="px-8 pb-16 pt-6 max-mob:px-4">
                <div className="mb-6 flex items-center gap-3">
                    <h1 className={ms.discHeaderTitle}>{genreName}</h1>
                    <span className={ms.discHeaderSub}>{kind === "movie" ? "фильмы" : "сериалы"}</span>
                </div>

                {/* Фильтры */}
                <div className="mb-6 flex flex-wrap gap-3">
                    <select className={ms.input} value={normalizedSort} onChange={(e) => setFilter("sort", e.target.value)}>
                        {sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select className={ms.input} value={urlYear} onChange={(e) => setFilter("year", e.target.value)}>
                        <option value="">Все годы</option>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    {(urlYear || normalizedSort !== "popularity.desc") && (
                        <button className={ms.button.sm} onClick={resetFilters}>Сбросить</button>
                    )}
                </div>

                {/* Сетка */}
                <div className={ms.grid}>
                    {items.map((it) => (
                        <button key={it.kind + it.tmdbId} className={ms.item} title={it.title} onClick={() => open(it)}>
                            <span className={ms.posterBox}>
                                {it.poster
                                    ? <img className={ms.itemPoster} src={posterUrl(it.poster)} alt="" loading="lazy" onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}/>
                                    : <span className={cn(ms.itemPoster, "grid place-items-center text-xl opacity-50")}>{it.kind === "movie" ? "🎬" : "📺"}</span>}
                                {it.rating != null && <span className={ms.posterBadge} style={{top: 6, left: 6, right: "auto"}}>★ {it.rating.toFixed(1)}</span>}
                            </span>
                            <span className={ms.itemName}>{it.title}</span>
                            <span className={ms.itemMeta}>{it.year ?? ""}</span>
                            <span className={ms.itemPlay}>›</span>
                        </button>
                    ))}
                    {loading && Array.from({length: 6}).map((_, i) => <div key={"sk" + i} className={ms.skeleton}/>)}
                </div>

                {error && <div className={cn(ms.empty, "mt-8 text-center text-bad")}>{error}</div>}
                {!loading && !error && items.length === 0 && (
                    <div className={cn(ms.empty, "mt-8 text-center")}>
                        {media.tmdb ? "Ничего не найдено по этим фильтрам." : "TMDB не настроен."}
                    </div>
                )}
                <div ref={sentinel} className="h-2"/>
            </div>
        </div>
    );
}
