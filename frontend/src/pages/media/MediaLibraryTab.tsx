// Library tab for MediaPage: hero, continue-watching row, poster grid, filters.

import {useEffect, useRef, useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {
    refreshJellyfin,
    getMediaLibrary,
    jellyfinPosterUrl,
    jellyfinBackdropUrl,
    getMoviePageDetail,
    getSeriesPageDetail,
    type LibraryItem,
    type ResumeItem,
    type MoviePageDetail,
    type SeriesPageDetail,
} from "@/lib/api.ts";
import {useToast} from "../../components/ui/Toast.tsx";
import {cn} from "../../lib/cn.ts";
import {media as ms} from "./shared/mediaStyles.ts";
import {MediaHero} from "./shared/MediaHero.tsx";

interface MediaLibraryTabProps {
    library: LibraryItem[];
    setLibrary: (l: LibraryItem[]) => void;
    libReady: boolean;
    resume: ResumeItem[];
    fType: "all" | "Series" | "Movie";
    setFType: (v: "all" | "Series" | "Movie") => void;
    onlyUnwatched: boolean;
    setOnlyUnwatched: (v: boolean | ((prev: boolean) => boolean)) => void;
    sortBy: "name" | "year";
    shownLibrary: LibraryItem[];
    onPlayResume: (it: ResumeItem) => void;
    busy: string | null;
}

interface LibraryHeroProps {
    heroItem: LibraryItem | null;
    resume: ResumeItem[];
    openDetail: (it: LibraryItem, autoplay?: boolean) => void;
}

type HeroDetail = MoviePageDetail | SeriesPageDetail | null;

const getRandomItem = <T,>(arr: T[]): T | null => {
    if (arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
};

function fmtRuntime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}ч ${m > 0 ? m + "мин" : ""}`.trim() : `${m}мин`;
}

export function MediaLibraryTab({
                                    library,
                                    setLibrary,
                                    libReady,
                                    resume,
                                    fType,
                                    setFType,
                                    onlyUnwatched,
                                    setOnlyUnwatched,
                                    sortBy: _sortBy,
                                    shownLibrary,
                                    onPlayResume,
                                    busy: _busy,
                                }: MediaLibraryTabProps) {
    const nav = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const from = `${location.pathname}${location.search}`;

    const openDetail = (it: LibraryItem, autoplay = false) =>
        nav(
            `/media/${it.type === "Series" ? "series" : "movie"}/${it.id}${
                autoplay ? `?autoplay=1&play=${encodeURIComponent(it.id)}` : ""
            }`,
            {
                state: autoplay
                    ? {from, autoplay: true, autoplayItemId: it.id}
                    : {from},
            },
        );

    // Pick hero once when library loads; re-pick if library changes significantly
    const heroRef = useRef<LibraryItem | null>(null);
    if (heroRef.current === null && shownLibrary.length > 0) {
        heroRef.current = getRandomItem(shownLibrary);
    }
    const heroItem = heroRef.current;

    return (
        <div id="libraryContainer" className={ms.libPage}>
            <LibraryHero heroItem={heroItem} resume={resume} openDetail={openDetail}/>

            {/* Continue watching row */}
            {resume.length > 0 && (
                <div className={ms.section}>
                    <div className={ms.sectionHead}>
                        <span className={ms.sectionTitle}>ПРОДОЛЖИТЬ ПРОСМОТР</span>
                        <span className={ms.countBadge}>{resume.length}</span>
                    </div>
                    <div className={ms.hTrack}>
                        {resume.map((it) => {
                            const COLORS = ["#cc3300","#0077dd","#00aaee","#8833ff","#ffaa00","#00b8ae"];
                            const accent = COLORS[it.title.charCodeAt(0) % COLORS.length];
                            return (
                                <div key={it.id} className={cn(ms.watchCard, "group")} onClick={() => onPlayResume(it)}>
                                    <div className={ms.watchThumb}>
                                        <div className="absolute inset-0">
                                            <img
                                                src={jellyfinPosterUrl(it.id)}
                                                alt=""
                                                style={{width: "100%", height: "100%", objectFit: "cover"}}
                                                onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}
                                            />
                                        </div>
                                        <div className={ms.watchVignette}/>
                                        <div className={ms.watchPlayLayer}>
                                            <div className={ms.roundPlay}>
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                                    <polygon points="6,3 21,12 6,21"/>
                                                </svg>
                                            </div>
                                        </div>
                                        <div className={ms.watchProg}>
                                            <div className="h-full" style={{width: it.positionPct + "%", background: accent}}/>
                                        </div>
                                    </div>
                                    <div className={ms.watchInfo}>
                                        <div className={ms.watchTitle}>{it.title}</div>
                                        <div className={ms.watchMeta}>
                                            {it.kind === "episode" && <span className="text-white/40">эпизод · </span>}
                                            <span style={{color: accent}}>{Math.round(it.positionPct)}% просмотрено</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Library poster grid */}
            <div className={ms.section}>
                <div className={ms.sectionHead}>
                    <span className={ms.sectionTitle}>БИБЛИОТЕКА</span>
                    <span className={ms.countBadge}>{shownLibrary.length}</span>
                    <button
                        className={ms.scanButton}
                        onClick={() =>
                            refreshJellyfin().then(() =>
                                getMediaLibrary().then((l) => {
                                    setLibrary(l);
                                    toast.success("Скан библиотеки запущен");
                                }),
                            )
                        }
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M3 12h18"/>
                        </svg>
                        Сканировать
                    </button>
                </div>

                <div className={ms.filterTabs}>
                    {[
                        {label: "Все", val: "all" as const},
                        {label: "Сериалы", val: "Series" as const},
                        {label: "Фильмы", val: "Movie" as const},
                    ].map((f) => (
                        <button
                            key={f.val}
                            className={cn(ms.filterTab, fType === f.val && ms.filterTabOn)}
                            onClick={() => setFType(f.val)}
                        >
                            {f.label}
                        </button>
                    ))}
                    <button
                        className={cn(ms.filterTab, onlyUnwatched && ms.filterTabOn)}
                        onClick={() => setOnlyUnwatched((v) => !v)}
                    >
                        Не просмотрено
                    </button>
                </div>

                {!libReady ? (
                    <div className={cn(ms.hTrack, ms.posterRow)}>
                        {Array.from({length: 8}).map((_, i) => (
                            <div key={i} style={{flex: "0 0 auto", width: 160, aspectRatio: "2/3", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)"}}/>
                        ))}
                    </div>
                ) : shownLibrary.length === 0 ? (
                    <div style={{padding: "24px 0", color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12}}>
                        {library.length === 0 ? "Библиотека пуста или ещё не отсканирована." : "Ничего не подходит под фильтр."}
                    </div>
                ) : (
                    <div className={cn(ms.hTrack, ms.posterRow)}>
                        {shownLibrary.map((it) => {
                            const isSeries = it.type === "Series";
                            return (
                                <div key={it.id} className={cn(ms.posterCard, "group")} onClick={() => openDetail(it)}>
                                    <div className={ms.posterArt}>
                                        <img
                                            src={jellyfinPosterUrl(it.id)}
                                            alt=""
                                            loading="lazy"
                                            style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
                                            onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}
                                        />
                                        <div style={{position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)", zIndex: 0}}/>
                                        {isSeries && it.childCount ? (
                                            <span className={ms.posterBadge}>{it.childCount} сез.</span>
                                        ) : null}
                                        <div className={cn(ms.posterOverlay, "z-5")}>
                                            <div className={ms.roundPlay}>
                                                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                                                    <polygon points="6,3 21,12 6,21"/>
                                                </svg>
                                            </div>
                                            {it.unplayed > 0 && (
                                                <div className={ms.posterGenres}>{it.unplayed} не просмотрено</div>
                                            )}
                                        </div>
                                        {it.played && (
                                            <span className={cn(ms.posterBadge, "left-2.25 right-auto bg-accent text-black")} style={{top: 9}}>✓</span>
                                        )}
                                    </div>
                                    <div className={ms.posterInfo}>
                                        <div className={ms.posterTitle}>{it.name}</div>
                                        <div className={ms.posterSub}>
                                            {isSeries ? "сериал" : "фильм"}{it.year ? ` · ${it.year}` : ""}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}


function LibraryHero({heroItem, resume, openDetail}: LibraryHeroProps) {
    const [heroDetail, setHeroDetail] = useState<HeroDetail>(null);

    useEffect(() => {
        if (!heroItem) return;
        setHeroDetail(null);
        if (heroItem.type === "Movie") {
            getMoviePageDetail(heroItem.id).then(setHeroDetail);
        } else {
            getSeriesPageDetail(heroItem.id).then(setHeroDetail);
        }
    }, [heroItem?.id]);

    if (!heroItem) return null;

    // Cross-reference with resume list
    const resumeItem = resume.find((r) => r.id === heroItem.id);
    const isResuming = !!resumeItem;

    const overview = heroDetail?.overview ?? null;
    const genres = heroDetail?.genres ?? [];
    const rating = heroDetail?.rating ?? null;
    const runtime = heroDetail?.runtime ?? null;

    return (
        <MediaHero
            title={heroItem.name}
            eyebrow={isResuming ? "ПРОДОЛЖИТЬ ПРОСМОТР" : "В БИБЛИОТЕКЕ"}
            backgroundSrc={jellyfinBackdropUrl(heroItem.id)}
            overview={overview}
            metaItems={[
                heroItem.year ? heroItem.year : null,
                runtime ? fmtRuntime(runtime) : null,
                rating ? (
                    <span className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="#ffd700"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {rating.toFixed(1)}
                    </span>
                ) : null,
            ]}
            badges={genres}
            progress={isResuming && resumeItem ? {
                valuePct: resumeItem.positionPct,
                label: `${Math.round(resumeItem.positionPct)}% просмотрено`,
            } : null}
            onOpen={() => openDetail(heroItem)}
            actions={
                <>
                    <button
                        className={ms.playButton}
                        onClick={(e) => { e.stopPropagation(); openDetail(heroItem, true); }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="6,3 21,12 6,21"/>
                        </svg>
                        Смотреть
                    </button>
                    <button
                        className={ms.heroGhostBtn}
                        onClick={(e) => { e.stopPropagation(); openDetail(heroItem); }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9"/>
                            <path d="M12 8h.01M11 12h1v4h1"/>
                        </svg>
                        Подробнее
                    </button>
                </>
            }
        />
    );
}
