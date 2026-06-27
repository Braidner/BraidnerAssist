// Library tab for MediaPage: hero, continue-watching row, poster grid, filters.

import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
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
import * as React from "react";

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
    openDetail: (it: LibraryItem) => void;
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
    const toast = useToast();

    const openDetail = (it: LibraryItem) =>
        nav(`/media/${it.type === "Series" ? "series" : "movie"}/${it.id}`);

    // Pick hero once when library loads; re-pick if library changes significantly
    const heroRef = useRef<LibraryItem | null>(null);
    if (heroRef.current === null && shownLibrary.length > 0) {
        heroRef.current = getRandomItem(shownLibrary);
    }
    const heroItem = heroRef.current;

    return (
        <div className={ms.libPage}>
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
                            const colors = ["#cc3300","#0077dd","#00aaee","#8833ff","#ffaa00","#00b8ae"];
                            const accent = colors[it.title.charCodeAt(0) % colors.length];
                            return (
                                <div key={it.id} className={ms.watchCard} onClick={() => onPlayResume(it)}>
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
                            const colors = ["#cc3300","#0077dd","#00aaee","#8833ff","#ffaa00","#00b8ae"];
                            const accent = colors[it.name.charCodeAt(0) % colors.length];
                            const initials = it.name.split(" ").slice(0, 2).map((w: string) => w[0] || "").join("").toUpperCase();
                            return (
                                <div key={it.id} className={ms.posterCard} onClick={() => openDetail(it)}>
                                    <div className={ms.posterArt} style={{"--pa": accent} as React.CSSProperties}>
                                        <img
                                            src={jellyfinPosterUrl(it.id)}
                                            alt=""
                                            loading="lazy"
                                            style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
                                            onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}
                                        />
                                        <div style={{position: "absolute", inset: 0, background: `radial-gradient(ellipse at 60% 40%, ${accent}88 0%, ${accent}22 50%, #050508 100%)`, zIndex: 0}}/>
                                        <div style={{position: "absolute", bottom: "-10%", right: "-4%", lineHeight: 1, fontFamily: "'Oswald', sans-serif", fontSize: 100, color: "rgba(255,255,255,0.07)", userSelect: "none", pointerEvents: "none", zIndex: 0}}>
                                            {initials}
                                        </div>
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


const LibraryHero: React.FC<LibraryHeroProps> = ({heroItem, resume, openDetail}) => {
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

    const colors = ["#cc3300","#0077dd","#00aaee","#8833ff","#ffaa00","#00b8ae"];
    const accent = colors[heroItem.name.charCodeAt(0) % colors.length];
    const bg = `radial-gradient(ellipse at 60% 40%, ${accent}88 0%, ${accent}22 50%, #050508 100%)`;

    // Cross-reference with resume list
    const resumeItem = resume.find((r) => r.id === heroItem.id);
    const isResuming = !!resumeItem;

    const overview = heroDetail?.overview ?? null;
    const genres = heroDetail?.genres ?? [];
    const rating = heroDetail?.rating ?? null;
    const runtime = heroDetail?.runtime ?? null;

    return (
        <div className={ms.libHero} style={{cursor: "pointer"}} onClick={() => openDetail(heroItem)}>
            <div className={ms.libHeroBg} style={{background: bg}}>
                <img
                    src={jellyfinBackdropUrl(heroItem.id)}
                    alt=""
                    style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", opacity: 0.55}}
                    onError={(e) => {(e.currentTarget as HTMLImageElement).style.display = "none";}}
                />
            </div>
            <div className={ms.libHeroGlow} style={{background: `radial-gradient(ellipse at 74% 50%, ${accent}40 0%, transparent 58%)`}}/>
            <div className={ms.libHeroGrain}/>
            <div className={ms.libHeroVignette}/>
            <div className={ms.libHeroBody}>
                {/* Eyebrow */}
                <div className={ms.libEyebrow}>
                    <span className="size-1.5 shrink-0 rounded-full" style={{background: accent}}/>
                    {isResuming ? "ПРОДОЛЖИТЬ ПРОСМОТР" : "В БИБЛИОТЕКЕ"}
                </div>

                {/* Title */}
                <h1 className={ms.libHeroTitle}>{heroItem.name}</h1>

                {/* Meta row */}
                <div className={ms.heroMetaRow}>
                    {heroItem.year && <span>{heroItem.year}</span>}
                    {runtime && (
                        <>
                            <span className={ms.heroMetaSep}>·</span>
                            <span>{fmtRuntime(runtime)}</span>
                        </>
                    )}
                    {rating && (
                        <>
                            <span className={ms.heroMetaSep}>·</span>
                            <span className="flex items-center gap-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="#ffd700"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                {rating.toFixed(1)}
                            </span>
                        </>
                    )}
                    {genres.slice(0, 3).map((g) => (
                        <span key={g} className={ms.heroGenreTag}>{g}</span>
                    ))}
                </div>

                {/* Description */}
                {overview && <p className={ms.heroDesc}>{overview}</p>}

                {/* Actions */}
                <div className={ms.libActions}>
                    <button
                        className={ms.playButton}
                        style={{"--bc": accent} as React.CSSProperties}
                        onClick={(e) => { e.stopPropagation(); openDetail(heroItem); }}
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
                            <path d="M5 3h14a1 1 0 011 1v17l-8-4-8 4V4a1 1 0 011-1z"/>
                        </svg>
                        В очередь
                    </button>
                </div>

                {/* Progress bar (resume only) */}
                {isResuming && resumeItem && (
                    <div className={ms.progRow}>
                        <div className={ms.progTrack}>
                            <div className={ms.progFill} style={{width: resumeItem.positionPct + "%", background: accent}}/>
                        </div>
                        <span className={ms.progLabel}>{Math.round(resumeItem.positionPct)}% просмотрено</span>
                    </div>
                )}
            </div>
        </div>
    );
};
