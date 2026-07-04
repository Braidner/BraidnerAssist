// Discover tab for MediaPage: cinematic, rail-driven discovery (LAMPA/ZONA-style).
// Данные приходят из getDiscoverRails() (TMDB hero + рейлы) + «потому что
// вы смотрели». Hero использует широкий backdrop; заголовки жанровых рейлов ведут в жанровый хаб.

import {useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {
    posterUrl,
    backdropUrl,
    jellyfinPosterUrl,
    type MediaLookupItem,
    type TmdbItem,
    type LibraryItem,
    type DiscoverHome,
    type DiscoverRail,
} from "@/lib/api.ts";
import {cn} from "../../lib/cn.ts";
import {Button} from "../../components/ui/button.tsx";
import {media as ms} from "./shared/mediaStyles.ts";
import {MediaHero} from "./shared/MediaHero.tsx";
import {MediaPosterCard, MediaRail} from "./shared/mediaRails.tsx";

interface MediaDiscoverTabProps {
    library: LibraryItem[];
    tmdb: boolean;
    dq: string;
    setDq: (v: string) => void;
    dres: MediaLookupItem[];
    tmRes: TmdbItem[];
    dsearching: boolean;
    home: DiscoverHome;
    because: DiscoverRail[];
    homeLoading: boolean;
    busy: string | null;
    onRefresh: () => void | Promise<unknown>;
    onOpenDiscover: (it: MediaLookupItem) => void;
    onOpenTmdb: (it: TmdbItem) => void;
    onAddTmdb: (it: TmdbItem) => void | Promise<unknown>;
    onPreference: (it: TmdbItem, status: "watchlist" | "hidden" | "liked" | "disliked") => void | Promise<unknown>;
}

/* ─── Shuffle SVG ─── */
function ShuffleIcon({size = 15}: {size?: number}) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M16 3h5v5M4 20L21 3M16 21h5v-5M4 4l8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

/* ─── TMDB rail (reusable for home rails + because-you-watched) ─── */
function TmdbRail({rail, onOpenTmdb, onPreference, ranked}: {
    rail: DiscoverRail; onOpenTmdb: (it: TmdbItem) => void;
    onPreference: (it: TmdbItem, status: "watchlist" | "hidden" | "liked" | "disliked") => void; ranked?: boolean;
}) {
    const nav = useNavigate();
    const items = rail.items;
    if (!items.length) return null;
    const genreId = rail.key.startsWith("g") ? Number(rail.key.slice(1)) : null;
    const canOpenGenre = rail.kind !== "mixed" && genreId != null && Number.isFinite(genreId);
    return (
        <MediaRail
            title={rail.label.toUpperCase()}
            count={items.length}
            onTitleClick={canOpenGenre ? () => nav(`/media/discover/genre/${rail.kind}/${genreId}`) : undefined}
        >
            {items.map((it, i) => (
                <MediaPosterCard
                    key={it.kind + it.tmdbId}
                    title={it.title}
                    subtitle={`${it.kind === "movie" ? "фильм" : "сериал"}${it.year ? ` · ${it.year}` : ""}`}
                    imageUrl={it.poster ? posterUrl(it.poster) : null}
                    rating={it.rating}
                    rank={ranked ? i + 1 : undefined}
                    onClick={() => onOpenTmdb(it)}
                    onHide={() => onPreference(it, "hidden")}
                    onWatchlist={() => onPreference(it, "watchlist")}
                />
            ))}
        </MediaRail>
    );
}

/* ─── Cinematic TMDB hero with wide backdrop ─── */
function DiscoverHero({hero, loading, onRefresh, onOpen, onAddTmdb, onPreference}: {
    hero: TmdbItem | null; loading: boolean; onRefresh: () => void | Promise<unknown>; onOpen: (it: TmdbItem) => void;
    onAddTmdb: (it: TmdbItem) => void | Promise<unknown>;
    onPreference: (it: TmdbItem, status: "watchlist" | "hidden" | "liked" | "disliked") => void | Promise<unknown>;
}) {
    if (!hero) return null;
    const bg = backdropUrl(hero.backdrop) ?? posterUrl(hero.poster, "w780");
    return (
        <MediaHero
            title={hero.title}
            eyebrow="В ТРЕНДЕ СЕЙЧАС"
            backgroundSrc={bg ?? null}
            overview={hero.overview}
            loading={loading}
            onOpen={() => onOpen(hero)}
            metaItems={[
                hero.kind === "movie" ? "фильм" : "сериал",
                hero.year ? hero.year : null,
                hero.rating != null ? (
                    <span style={{color: "#ffd978"}}>★ {hero.rating.toFixed(1)}</span>
                ) : null,
            ]}
            badges={["TMDB", hero.rating != null && hero.rating >= 7 ? "Высокий рейтинг" : "Популярное"]}
            actions={
                <>
                    <Button
                        className={ms.playButton}
                        onClick={(e) => { e.stopPropagation(); onOpen(hero); }}
                    >
                        Подробнее
                    </Button>
                    <Button
                        className={ms.heroGhostBtn}
                        onClick={(e) => { e.stopPropagation(); return onAddTmdb(hero); }}
                    >
                        Добавить
                    </Button>
                    <Button
                        className={ms.heroGhostBtn}
                        onClick={(e) => { e.stopPropagation(); return onPreference(hero, "watchlist"); }}
                    >
                        В список
                    </Button>
                    <Button
                        className={ms.heroGhostBtn}
                        loading={loading}
                        loadingLabel="Обновляем"
                        onClick={(e) => { e.stopPropagation(); return onRefresh(); }}
                    >
                        <ShuffleIcon size={15}/> Другой
                    </Button>
                </>
            }
        />
    );
}

/* ─── Search results grid ─── */
function SearchGrid({
    dq, tmdb, dsearching, dres, tmRes, busy, onOpenDiscover, onOpenTmdb,
}: Pick<MediaDiscoverTabProps, "dq"|"tmdb"|"dsearching"|"dres"|"tmRes"|"busy"|"onOpenDiscover"|"onOpenTmdb">) {
    if (!dq.trim()) return null;
    const items = tmdb ? tmRes : dres;
    const loading = dsearching && items.length === 0;
    return (
        <div className="mb-6">
            {loading ? (
                <div className={ms.grid}>
                    {Array.from({length: 6}).map((_, i) => <div key={i} className={ms.skeleton}/>)}
                </div>
            ) : items.length === 0 ? (
                <div className={cn(ms.empty, "mt-2.5")}>Ничего не найдено.</div>
            ) : (
                <div className={ms.grid}>
                    {tmdb
                        ? tmRes.map((it) => (
                            <button key={it.kind + it.tmdbId} className={ms.item} title={it.title}
                                disabled={busy === "tmdb" + it.tmdbId} onClick={() => onOpenTmdb(it)}>
                                <span className={ms.posterBox}>
                                    {it.poster
                                        ? <img className={ms.itemPoster} src={posterUrl(it.poster)} alt="" loading="lazy" onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}/>
                                        : <span className={cn(ms.itemPoster, "grid place-items-center text-xl opacity-50")}>{it.kind === "movie" ? "🎬" : "📺"}</span>}
                                </span>
                                <span className={ms.itemName}>{it.title}</span>
                                <span className={ms.itemMeta}>{it.kind === "movie" ? "фильм" : "сериал"}{it.year ? ` · ${it.year}` : ""}</span>
                                <span className={ms.itemPlay}>{busy === "tmdb" + it.tmdbId ? "…" : "›"}</span>
                            </button>
                        ))
                        : dres.map((it) => (
                            <button key={it.kind + it.id} className={ms.item} title={it.title} onClick={() => onOpenDiscover(it)}>
                                <span className={ms.posterBox}>
                                    {it.poster
                                        ? <img className={ms.itemPoster} src={posterUrl(it.poster)} alt="" loading="lazy" onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}/>
                                        : <span className={cn(ms.itemPoster, "grid place-items-center text-xl opacity-50")}>{it.kind === "movie" ? "🎬" : "📺"}</span>}
                                    {it.added && <span className={ms.seenBadge} title="Уже в библиотеке">✓</span>}
                                </span>
                                <span className={ms.itemName}>{it.title}</span>
                                <span className={ms.itemMeta}>{it.kind === "movie" ? "фильм" : "сериал"}{it.year ? ` · ${it.year}` : ""}</span>
                                <span className={ms.itemPlay}>›</span>
                            </button>
                        ))
                    }
                </div>
            )}
        </div>
    );
}

export function MediaDiscoverTab({
    library, tmdb, dq, setDq, dres, tmRes, dsearching,
    home, because, homeLoading, busy,
    onRefresh, onOpenDiscover, onOpenTmdb, onAddTmdb, onPreference,
}: MediaDiscoverTabProps) {
    const nav = useNavigate();
    const location = useLocation();
    const [searchOpen] = useState(true);
    const from = `${location.pathname}${location.search}`;
    const returnState = () => ({
        from,
        scrollY: window.scrollY,
        mediaReturn: true,
    });

    const seriesItems = library.filter((i) => i.type === "Series");
    const movieItems = library.filter((i) => i.type === "Movie");

    return (
        <div className={ms.discPage}>
            <DiscoverHero hero={home.hero} loading={homeLoading} onRefresh={onRefresh} onOpen={onOpenTmdb}
                onAddTmdb={onAddTmdb} onPreference={onPreference}/>

            {/* Expandable search */}
            {searchOpen && (
                <div className={ms.discSearchBar}>
                    <input
                        autoFocus
                        className={ms.input}
                        placeholder="Поиск фильмов и сериалов…"
                        value={dq}
                        onChange={(e) => setDq(e.target.value)}
                    />
                    {dq && <Button className={ms.button.iconSm} title="Очистить" onClick={() => setDq("")}>✕</Button>}
                </div>
            )}
            {searchOpen && dq.trim() && (
                <SearchGrid dq={dq} tmdb={tmdb} dsearching={dsearching} dres={dres} tmRes={tmRes}
                    busy={busy} onOpenDiscover={onOpenDiscover} onOpenTmdb={onOpenTmdb}/>
            )}

            {/* TMDB discovery rails (trending / top / fresh / genres) */}
            {home.rails.map((rail) => (
                <TmdbRail key={rail.key} rail={rail}
                    onOpenTmdb={onOpenTmdb} onPreference={onPreference}
                    ranked={rail.key === "top" || rail.key === "trending"}/>
            ))}

            {/* Because you watched (personalized) */}
            {because.map((rail) => (
                <TmdbRail key={rail.key} rail={rail} onOpenTmdb={onOpenTmdb}
                    onPreference={onPreference}/>
            ))}

            {/* Library rails */}
            {seriesItems.length > 0 && (
                <MediaRail title="СЕРИАЛЫ В БИБЛИОТЕКЕ" count={seriesItems.length}>
                    {seriesItems.map((it) => (
                        <MediaPosterCard key={it.id} title={it.name}
                            subtitle={`сериал${it.year ? ` · ${it.year}` : ""}`}
                            imageUrl={jellyfinPosterUrl(it.id)} seasonCount={it.childCount}
                            onClick={() => nav(it.tmdbId ? `/media/series/${it.tmdbId}` : `/media/jellyfin/series/${it.id}`, {state: returnState()})}/>
                    ))}
                </MediaRail>
            )}
            {movieItems.length > 0 && (
                <MediaRail title="ФИЛЬМЫ В БИБЛИОТЕКЕ" count={movieItems.length}>
                    {movieItems.map((it) => (
                        <MediaPosterCard key={it.id} title={it.name}
                            subtitle={`фильм${it.year ? ` · ${it.year}` : ""}`}
                            imageUrl={jellyfinPosterUrl(it.id)}
                            onClick={() => nav(it.tmdbId ? `/media/movie/${it.tmdbId}` : `/media/jellyfin/movie/${it.id}`, {state: returnState()})}/>
                    ))}
                </MediaRail>
            )}

            {/* Empty state */}
            {!homeLoading && home.rails.length === 0 && library.length === 0 && (
                <div className={cn(ms.empty, "mt-8 text-center")}>
                    {tmdb
                        ? "Пока пусто. Найди первый тайтл через поиск."
                        : "TMDB не настроен — дискавери-подборки недоступны. Добавляй тайтлы через поиск."}
                </div>
            )}
        </div>
    );
}
