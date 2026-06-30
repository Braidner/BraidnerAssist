// Library tab for MediaPage: hero, library actions, and poster rails.

import {useEffect, useRef, useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {
    refreshJellyfin,
    getMediaLibrary,
    jellyfinPosterUrl,
    jellyfinBackdropUrl,
    getMoviePageDetail,
    getSeriesPageDetail,
    tmdbResolveTvdb,
    type LibraryItem,
    type ResumeItem,
    type MoviePageDetail,
    type SeriesPageDetail,
    type TorrentRailItem,
} from "@/lib/api.ts";
import {useToast} from "../../components/ui/Toast.tsx";
import {cn} from "../../lib/cn.ts";
import {media as ms} from "./shared/mediaStyles.ts";
import {MediaHero} from "./shared/MediaHero.tsx";
import {ContinueWatchingCard, MediaPosterCard, MediaRail} from "./shared/mediaRails.tsx";
import {TorrentRailCard} from "./shared/mediaShared.tsx";

interface MediaLibraryTabProps {
    library: LibraryItem[];
    setLibrary: (l: LibraryItem[]) => void;
    libReady: boolean;
    torrentRail: TorrentRailItem[];
    resume: ResumeItem[];
    onPlayResume: (it: ResumeItem) => void;
}

interface LibraryHeroProps {
    heroItem: LibraryItem | null;
    resume: ResumeItem[];
    openDetail: (it: LibraryItem, autoplay?: boolean) => void;
    scan: () => void;
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
                                    torrentRail,
                                    resume,
                                    onPlayResume,
                                }: MediaLibraryTabProps) {
    const nav = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const from = `${location.pathname}${location.search}`;
    const returnState = () => ({
        from,
        scrollY: window.scrollY,
        mediaReturn: true,
    });

    const openDetail = (it: LibraryItem, autoplay = false) =>
        nav(
            `/media/${it.type === "Series" ? "series" : "movie"}/${it.id}${
                autoplay ? `?autoplay=1&play=${encodeURIComponent(it.id)}` : ""
            }`,
            {
                state: autoplay
                    ? {...returnState(), autoplay: true, autoplayItemId: it.id}
                    : returnState(),
            },
        );

    const openTorrentTitle = async (item: TorrentRailItem) => {
        if (item.jellyfinId) {
            nav(`/media/${item.kind === "series" ? "series" : "movie"}/${item.jellyfinId}`, {
                state: returnState(),
            });
            return;
        }
        if (item.kind === "movie") {
            nav(`/media/discover/movie/${item.tmdbId}`, {state: returnState()});
            return;
        }
        const tvdbId = item.tvdbId ?? await tmdbResolveTvdb(item.tmdbId);
        if (tvdbId) {
            nav(`/media/discover/series/${tvdbId}`, {state: returnState()});
        } else {
            toast.error("Не удалось открыть карточку: TMDB не вернул tvdbId");
        }
    };

    const sortedLibrary = [...library].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const movieItems = sortedLibrary.filter((it) => it.type === "Movie");
    const seriesItems = sortedLibrary.filter((it) => it.type === "Series");

    // Pick hero once when library loads; re-pick if library changes significantly
    const heroRef = useRef<LibraryItem | null>(null);
    if (heroRef.current === null && sortedLibrary.length > 0) {
        heroRef.current = getRandomItem(sortedLibrary);
    }
    const heroItem = heroRef.current;

    const scan = () => {
        refreshJellyfin().then(() =>
          getMediaLibrary().then((l) => {
              setLibrary(l);
              toast.success("Скан библиотеки запущен");
          }),
        )
    }

    return (
        <div id="libraryContainer" className={ms.libPage}>
            <LibraryHero heroItem={heroItem} resume={resume} openDetail={openDetail} scan={scan}/>

            {torrentRail.length > 0 && (
                <MediaRail title="СКАЧИВАЕТСЯ / СКОРО В БИБЛИОТЕКЕ" countLabel={String(torrentRail.length)} className={ms.section}>
                    {torrentRail.map((it) => (
                        <TorrentRailCard key={it.infohash} item={it} onOpen={() => void openTorrentTitle(it)} />
                    ))}
                </MediaRail>
            )}

            {resume.length > 0 && (
                <MediaRail title="ПРОДОЛЖИТЬ ПРОСМОТР" countLabel={String(resume.length)} className={ms.section}>
                    {resume.map((it) => (
                        <ContinueWatchingCard
                            key={it.id}
                            item={it}
                            imageUrl={jellyfinPosterUrl(it.id)}
                            onClick={() => onPlayResume(it)}
                        />
                    ))}
                </MediaRail>
            )}

            {!libReady ? (
                <div className={cn(ms.hTrack, ms.posterRow, ms.railInset)}>
                    {Array.from({length: 8}).map((_, i) => (
                        <div key={i} style={{flex: "0 0 auto", width: 160, aspectRatio: "2/3", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)"}}/>
                    ))}
                </div>
            ) : library.length === 0 ? (
                <div className={ms.railHeaderInset} style={{paddingTop: 24, paddingBottom: 24, color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12}}>
                    Библиотека пуста или ещё не отсканирована.
                </div>
            ) : (
                <>
                    {movieItems.length > 0 && (
                        <MediaRail title="ФИЛЬМЫ" count={movieItems.length} className={ms.section}>
                            {movieItems.map((it) => (
                                <MediaPosterCard
                                    key={it.id}
                                    title={it.name}
                                    subtitle={`фильм${it.year ? ` · ${it.year}` : ""}`}
                                    imageUrl={jellyfinPosterUrl(it.id)}
                                    rating={it.rating}
                                    onClick={() => openDetail(it)}
                                />
                            ))}
                        </MediaRail>
                    )}

                    {seriesItems.length > 0 && (
                        <MediaRail title="СЕРИАЛЫ" count={seriesItems.length} className={ms.section}>
                            {seriesItems.map((it) => (
                                <MediaPosterCard
                                    key={it.id}
                                    title={it.name}
                                    subtitle={`сериал${it.year ? ` · ${it.year}` : ""}`}
                                    imageUrl={jellyfinPosterUrl(it.id)}
                                    seasonCount={it.childCount}
                                    rating={it.rating}
                                    onClick={() => openDetail(it)}
                                />
                            ))}
                        </MediaRail>
                    )}
                </>
            )}
        </div>
    );
}

function LibraryHero({heroItem, resume, openDetail, scan}: LibraryHeroProps) {
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
                    <button
                      className={ms.heroGhostBtn}
                      onClick={(e) => { e.stopPropagation(); scan(); }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M3 12h18"/>
                        </svg>
                        Сканировать
                    </button>
                </>
            }
        />
    );
}
