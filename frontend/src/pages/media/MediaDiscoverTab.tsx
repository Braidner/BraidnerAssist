// Discover tab for MediaPage: cinematic, rail-driven discovery (LAMPA/ZONA-style).
// Данные приходят из getDiscoverRails() (TMDB hero + рейлы) + «потому что
// вы смотрели». Hero использует широкий backdrop; заголовки жанровых рейлов ведут в жанровый хаб.

import {useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {
    posterUrl,
    backdropUrl,
    jellyfinPosterUrl,
    type ArrLookupItem,
    type TmdbItem,
    type LibraryItem,
    type DiscoverHome,
    type DiscoverRail,
} from "@/lib/api.ts";
import {cn} from "../../lib/cn.ts";
import {media as ms} from "./shared/mediaStyles.ts";
import {MediaHero} from "./shared/MediaHero.tsx";

interface MediaDiscoverTabProps {
    library: LibraryItem[];
    tmdb: boolean;
    dq: string;
    setDq: (v: string) => void;
    dres: ArrLookupItem[];
    tmRes: TmdbItem[];
    dsearching: boolean;
    home: DiscoverHome;
    because: DiscoverRail[];
    homeLoading: boolean;
    busy: string | null;
    onRefresh: () => void;
    onOpenDiscover: (it: ArrLookupItem) => void;
    onOpenTmdb: (it: TmdbItem) => void;
    onAddTmdb: (it: TmdbItem) => void;
    onPreference: (it: TmdbItem, status: "watchlist" | "hidden" | "liked" | "disliked") => void;
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
    actions?: {label: string; title?: string; onClick: (e: React.MouseEvent) => void}[];
}

function DiscPosterCard({title, year, sub, imgUrl, seasonCount, rating, rank, onClick, addBtn, actions}: DiscPosterCardProps) {
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
                {seasonCount ? <span className={ms.posterBadge}>{seasonCount} сез.</span> : null}
                {rank != null ? <span className={ms.posterRankBadge}>{rank}</span> : null}
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
            {actions?.length ? (
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                    {actions.map((a) => (
                        <button key={a.label} className={cn(ms.button.sm, "h-7 px-1 text-[10px]")} title={a.title ?? a.label} onClick={a.onClick}>
                            {a.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/* ─── Section with horizontal poster track ─── */
function DiscSection({label, count, children, onLabelClick}: {
    label: string;
    count: number;
    children: React.ReactNode;
    onLabelClick?: () => void;
}) {
    return (
        <div className={ms.discSection}>
            <div className={cn(ms.discSecHead, ms.railHeaderInset)}>
                {onLabelClick ? (
                    <button className={cn(ms.discSecLabel, ms.discSecLink)} onClick={onLabelClick}>
                        {label}
                    </button>
                ) : (
                    <span className={ms.discSecLabel}>{label}</span>
                )}
                <div className={ms.discSecLine}/>
                <span className={ms.discSecCount}>{count} тайтлов</span>
            </div>
            <div className={cn(ms.hTrack, ms.posterRow, ms.railInset)}>{children}</div>
        </div>
    );
}

/* ─── TMDB rail (reusable for home rails + because-you-watched) ─── */
function TmdbRail({rail, onOpenTmdb, onAddTmdb, onPreference, ranked}: {
    rail: DiscoverRail; onOpenTmdb: (it: TmdbItem) => void; onAddTmdb: (it: TmdbItem) => void;
    onPreference: (it: TmdbItem, status: "watchlist" | "hidden" | "liked" | "disliked") => void; ranked?: boolean;
}) {
    const nav = useNavigate();
    const items = rail.items;
    if (!items.length) return null;
    const genreId = rail.key.startsWith("g") ? Number(rail.key.slice(1)) : null;
    const canOpenGenre = rail.kind !== "mixed" && genreId != null && Number.isFinite(genreId);
    return (
        <DiscSection
            label={rail.label.toUpperCase()}
            count={items.length}
            onLabelClick={canOpenGenre ? () => nav(`/media/discover/genre/${rail.kind}/${genreId}`) : undefined}
        >
            {items.map((it, i) => (
                <DiscPosterCard
                    key={it.kind + it.tmdbId}
                    title={it.title}
                    year={it.year}
                    sub={it.kind === "movie" ? "фильм" : "сериал"}
                    imgUrl={it.poster ? posterUrl(it.poster) : null}
                    rating={it.rating}
                    rank={ranked ? i + 1 : undefined}
                    onClick={() => onOpenTmdb(it)}
                    actions={[
                        {label: "В список", onClick: (e) => { e.stopPropagation(); onPreference(it, "watchlist"); }},
                        {label: "Добавить", onClick: (e) => { e.stopPropagation(); onAddTmdb(it); }},
                        {label: "Скрыть", onClick: (e) => { e.stopPropagation(); onPreference(it, "hidden"); }},
                        {label: "Не интересно", onClick: (e) => { e.stopPropagation(); onPreference(it, "disliked"); }},
                    ]}
                />
            ))}
        </DiscSection>
    );
}

/* ─── Cinematic TMDB hero with wide backdrop ─── */
function DiscoverHero({hero, loading, onRefresh, onOpen, onAddTmdb, onPreference}: {
    hero: TmdbItem | null; loading: boolean; onRefresh: () => void; onOpen: (it: TmdbItem) => void;
    onAddTmdb: (it: TmdbItem) => void;
    onPreference: (it: TmdbItem, status: "watchlist" | "hidden" | "liked" | "disliked") => void;
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
                    <button
                        className={ms.playButton}
                        onClick={(e) => { e.stopPropagation(); onOpen(hero); }}
                    >
                        Подробнее
                    </button>
                    <button
                        className={ms.heroGhostBtn}
                        onClick={(e) => { e.stopPropagation(); onAddTmdb(hero); }}
                    >
                        Добавить
                    </button>
                    <button
                        className={ms.heroGhostBtn}
                        onClick={(e) => { e.stopPropagation(); onPreference(hero, "watchlist"); }}
                    >
                        В список
                    </button>
                    <button
                        className={ms.heroGhostBtn}
                        disabled={loading}
                        onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                    >
                        <ShuffleIcon size={15}/> {loading ? "Обновляем…" : "Другой"}
                    </button>
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
                    {dq && <button className={ms.button.iconSm} title="Очистить" onClick={() => setDq("")}>✕</button>}
                </div>
            )}
            {searchOpen && dq.trim() && (
                <SearchGrid dq={dq} tmdb={tmdb} dsearching={dsearching} dres={dres} tmRes={tmRes}
                    busy={busy} onOpenDiscover={onOpenDiscover} onOpenTmdb={onOpenTmdb}/>
            )}

            {/* TMDB discovery rails (trending / top / fresh / genres) */}
            {home.rails.map((rail) => (
                <TmdbRail key={rail.key} rail={rail}
                    onOpenTmdb={onOpenTmdb} onAddTmdb={onAddTmdb} onPreference={onPreference}
                    ranked={rail.key === "top" || rail.key === "trending"}/>
            ))}

            {/* Because you watched (personalized) */}
            {because.map((rail) => (
                <TmdbRail key={rail.key} rail={rail} onOpenTmdb={onOpenTmdb}
                    onAddTmdb={onAddTmdb} onPreference={onPreference}/>
            ))}

            {/* Library rails */}
            {seriesItems.length > 0 && (
                <DiscSection label="СЕРИАЛЫ В БИБЛИОТЕКЕ" count={seriesItems.length}>
                    {seriesItems.map((it) => (
                        <DiscPosterCard key={it.id} title={it.name} year={it.year} sub="сериал"
                            imgUrl={jellyfinPosterUrl(it.id)} seasonCount={it.childCount}
                            onClick={() => nav(`/media/series/${it.id}`, {state: returnState()})}/>
                    ))}
                </DiscSection>
            )}
            {movieItems.length > 0 && (
                <DiscSection label="ФИЛЬМЫ В БИБЛИОТЕКЕ" count={movieItems.length}>
                    {movieItems.map((it) => (
                        <DiscPosterCard key={it.id} title={it.name} year={it.year} sub="фильм"
                            imgUrl={jellyfinPosterUrl(it.id)}
                            onClick={() => nav(`/media/movie/${it.id}`, {state: returnState()})}/>
                    ))}
                </DiscSection>
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
