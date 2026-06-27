// Discover tab for MediaPage: cinematic discovery layout with sections.

import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {
    posterUrl,
    jellyfinPosterUrl,
    type ArrLookupItem,
    type Recommendation,
    type CalendarItem,
    type TmdbItem,
    type LibraryItem,
} from "@/lib/api.ts";
import {cn} from "../../lib/cn.ts";
import {media as ms} from "./shared/mediaStyles.ts";

interface MediaDiscoverTabProps {
    library: LibraryItem[];
    tmdb: boolean;
    dq: string;
    setDq: (v: string) => void;
    dres: ArrLookupItem[];
    tmRes: TmdbItem[];
    trending: TmdbItem[];
    dsearching: boolean;
    recs: Recommendation[];
    discoveryHero: Recommendation | null;
    heroLoading: boolean;
    calendar: CalendarItem[];
    busy: string | null;
    onRefreshHero: () => void;
    onAddRec: (rec: Recommendation) => void;
    onOpenDiscover: (it: ArrLookupItem) => void;
    onOpenTmdb: (it: TmdbItem) => void;
}

/* ─── Shuffle SVG ─── */
function ShuffleIcon({size = 15}: {size?: number}) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M16 3h5v5M4 20L21 3M16 21h5v-5M4 4l8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

/* ─── Poster card for discover sections ─── */
interface DiscPosterCardProps {
    title: string;
    year?: number | null;
    sub?: string;
    imgUrl?: string | null;
    seasonCount?: number | null;
    rating?: number | null;
    rank?: number;
    onClick: () => void;
    addBtn?: {label: string; disabled?: boolean; onClick: (e: React.MouseEvent) => void};
}

function DiscPosterCard({title, year, sub, imgUrl, seasonCount, rating, rank, onClick, addBtn}: DiscPosterCardProps) {
    return (
        <div className={cn(ms.posterCard, "group")} onClick={onClick} style={{cursor: "pointer"}}>
            <div className={ms.posterArt}>
                {imgUrl ? (
                    <img
                        src={imgUrl}
                        alt=""
                        loading="lazy"
                        style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
                        onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}
                    />
                ) : null}
                <div style={{position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)", zIndex: 0}}/>
                {/* Season badge */}
                {seasonCount ? <span className={ms.posterBadge}>{seasonCount} сез.</span> : null}
                {/* Rank badge */}
                {rank != null ? <span className={ms.posterRankBadge}>{rank}</span> : null}
                {/* Hover overlay */}
                <div className={cn(ms.posterOverlay, "z-5")}>
                    <div className={ms.roundPlay}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="6,3 21,12 6,21"/>
                        </svg>
                    </div>
                    {rating != null && (
                        <div className={ms.posterGenres} style={{display: "flex", alignItems: "center", gap: 3}}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="#ffd700"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            {rating.toFixed(1)}
                        </div>
                    )}
                </div>
            </div>
            <div className={ms.posterInfo}>
                <div className={ms.posterTitle}>{title}</div>
                <div className={ms.posterSub}>
                    {sub ?? ""}{year ? (sub ? ` · ${year}` : `${year}`) : ""}
                </div>
            </div>
            {addBtn && (
                <button
                    className={cn(ms.button.accentSm, "mt-1.5 w-full")}
                    disabled={addBtn.disabled}
                    onClick={addBtn.onClick}
                >
                    {addBtn.disabled ? "…" : addBtn.label}
                </button>
            )}
        </div>
    );
}

/* ─── Section with horizontal poster track ─── */
interface DiscSectionProps {
    label: string;
    count: number;
    children: React.ReactNode;
}

function DiscSection({label, count, children}: DiscSectionProps) {
    return (
        <div className={ms.discSection}>
            <div className={ms.discSecHead}>
                <span className={ms.discSecLabel}>{label}</span>
                <div className={ms.discSecLine}/>
                <span className={ms.discSecCount}>{count} тайтлов</span>
            </div>
            <div className={cn(ms.hTrack, ms.posterRow)}>{children}</div>
        </div>
    );
}

function DiscoverHero({
    hero,
    loading,
    busy,
    onRefresh,
    onAdd,
    onOpen,
}: {
    hero: Recommendation | null;
    loading: boolean;
    busy: string | null;
    onRefresh: () => void;
    onAdd: (rec: Recommendation) => void;
    onOpen: (it: ArrLookupItem) => void;
}) {
    if (!hero) return null;
    const key = "rec" + hero.kind + hero.id;
    const openHero = () => onOpen({
        kind: hero.kind,
        id: hero.id,
        title: hero.title,
        year: hero.year,
        overview: hero.overview,
        poster: hero.poster,
        added: false,
    });

    return (
        <section className={ms.discHero}>
            <div className={ms.discHeroBg}>
                {hero.poster ? (
                    <img
                        className={ms.discHeroImg}
                        src={posterUrl(hero.poster)}
                        alt=""
                        onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}
                    />
                ) : null}
                <div className={ms.discHeroShade}/>
            </div>
            <div className={ms.discHeroBody}>
                <div className={ms.discHeroKicker}>СЛУЧАЙНЫЙ ФИЛЬМ С ВЫСОКИМ РЕЙТИНГОМ</div>
                <h2 className={ms.discHeroTitle}>{hero.title}</h2>
                <div className={ms.discHeroMeta}>
                    <span>фильм</span>
                    {hero.year ? <><span>·</span><span>{hero.year}</span></> : null}
                    {hero.rating != null ? (
                        <>
                            <span>·</span>
                            <span style={{color: "#ffd978"}}>★ {hero.rating.toFixed(1)}</span>
                        </>
                    ) : null}
                    <span>·</span>
                    <span>не в библиотеке</span>
                </div>
                {hero.overview ? <p className={ms.discHeroOverview}>{hero.overview}</p> : null}
                <div className={ms.discHeroActions}>
                    <button
                        className={ms.playButton}
                        disabled={busy === key}
                        onClick={(e) => { e.stopPropagation(); onAdd(hero); }}
                    >
                        {busy === key ? "Добавляем…" : "Добавить"}
                    </button>
                    <button
                        className={ms.heroGhostBtn}
                        onClick={(e) => { e.stopPropagation(); openHero(); }}
                    >
                        Подробнее
                    </button>
                    <button
                        className={ms.heroGhostBtn}
                        disabled={loading}
                        onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                    >
                        <ShuffleIcon size={15}/> {loading ? "Ищем…" : "Другой фильм"}
                    </button>
                </div>
            </div>
        </section>
    );
}

/* ─── Search results grid (reused from old discover) ─── */
function SearchGrid({
    dq, tmdb, dsearching, dres, tmRes, busy,
    onOpenDiscover, onOpenTmdb,
}: Pick<MediaDiscoverTabProps, "dq"|"tmdb"|"dsearching"|"dres"|"tmRes"|"busy"|"onOpenDiscover"|"onOpenTmdb">) {
    if (!dq.trim()) return null;

    const isSearching = dq.trim().length > 0;
    const items = tmdb ? (isSearching ? tmRes : []) : (isSearching ? dres : []);
    const loading = isSearching && dsearching && items.length === 0;

    return (
        <div className="mb-6">
            {loading ? (
                <div className={ms.grid}>
                    {Array.from({length: 6}).map((_, i) => <div key={i} className={ms.skeleton}/>)}
                </div>
            ) : isSearching && items.length === 0 ? (
                <div className={cn(ms.empty, "mt-2.5")}>Ничего не найдено.</div>
            ) : isSearching ? (
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
            ) : null}
        </div>
    );
}

export function MediaDiscoverTab({
    library,
    tmdb,
    dq,
    setDq,
    dres,
    tmRes,
    trending,
    dsearching,
    recs,
    discoveryHero,
    heroLoading,
    calendar: _calendar,
    busy,
    onRefreshHero,
    onAddRec,
    onOpenDiscover,
    onOpenTmdb,
}: MediaDiscoverTabProps) {
    const nav = useNavigate();
    const [searchOpen] = useState(true);

    const trendingByRating = [...trending].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    const seriesItems = library.filter((i) => i.type === "Series");
    const movieItems = library.filter((i) => i.type === "Movie");

    return (
        <div className={ms.discPage}>
            <DiscoverHero
                hero={discoveryHero}
                loading={heroLoading}
                busy={busy}
                onRefresh={onRefreshHero}
                onAdd={onAddRec}
                onOpen={onOpenDiscover}
            />

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
                    {dq && (
                        <button className={ms.button.iconSm} title="Очистить" onClick={() => setDq("")}>✕</button>
                    )}
                </div>
            )}

            {/* Search results (only when search is open and has query) */}
            {searchOpen && dq.trim() && (
                <SearchGrid dq={dq} tmdb={tmdb} dsearching={dsearching} dres={dres} tmRes={tmRes}
                    busy={busy} onOpenDiscover={onOpenDiscover} onOpenTmdb={onOpenTmdb}/>
            )}

            {/* Top Rating — TMDB trending sorted by rating */}
            {trendingByRating.length > 0 && (
                <DiscSection label="ТОП РЕЙТИНГ" count={trendingByRating.length}>
                    {trendingByRating.map((it, i) => (
                        <DiscPosterCard
                            key={it.kind + it.tmdbId}
                            title={it.title}
                            year={it.year}
                            sub={it.kind === "movie" ? "фильм" : "сериал"}
                            imgUrl={it.poster ? posterUrl(it.poster) : null}
                            rating={it.rating}
                            rank={i + 1}
                            onClick={() => onOpenTmdb(it)}
                        />
                    ))}
                </DiscSection>
            )}

            {/* Series from library */}
            {seriesItems.length > 0 && (
                <DiscSection label="СЕРИАЛЫ" count={seriesItems.length}>
                    {seriesItems.map((it) => (
                        <DiscPosterCard
                            key={it.id}
                            title={it.name}
                            year={it.year}
                            sub="сериал"
                            imgUrl={jellyfinPosterUrl(it.id)}
                            seasonCount={it.childCount}
                            onClick={() => nav(`/media/series/${it.id}`)}
                        />
                    ))}
                </DiscSection>
            )}

            {/* Movies from library */}
            {movieItems.length > 0 && (
                <DiscSection label="ФИЛЬМЫ" count={movieItems.length}>
                    {movieItems.map((it) => (
                        <DiscPosterCard
                            key={it.id}
                            title={it.name}
                            year={it.year}
                            sub="фильм"
                            imgUrl={jellyfinPosterUrl(it.id)}
                            onClick={() => nav(`/media/movie/${it.id}`)}
                        />
                    ))}
                </DiscSection>
            )}

            {/* Recommendations (if no library content yet) */}
            {recs.length > 0 && seriesItems.length === 0 && movieItems.length === 0 && (
                <DiscSection label="РЕКОМЕНДАЦИИ" count={recs.length}>
                    {recs.map((r) => {
                        const key = "rec" + r.kind + r.id;
                        return (
                            <DiscPosterCard
                                key={key}
                                title={r.title}
                                year={r.year}
                                sub={r.kind === "movie" ? "фильм" : "сериал"}
                                imgUrl={r.poster ? posterUrl(r.poster) : null}
                                onClick={() => {}}
                                addBtn={{
                                    label: "+ Добавить",
                                    disabled: busy === key,
                                    onClick: (e) => { e.stopPropagation(); onAddRec(r); },
                                }}
                            />
                        );
                    })}
                </DiscSection>
            )}

            {/* Empty state */}
            {library.length === 0 && trending.length === 0 && recs.length === 0 && (
                <div className={cn(ms.empty, "mt-8 text-center")}>
                    Библиотека пуста. Добавь первый тайтл через поиск.
                </div>
            )}
        </div>
    );
}
