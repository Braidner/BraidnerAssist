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
    getMediaTitleDetail,
    posterUrl,
    type LibraryItem,
    type PendingMediaTitle,
    type ResumeItem,
    type MoviePageDetail,
    type SeriesPageDetail,
    type TorrentRailItem,
    type MediaHome,
    type MediaPreference,
    type MediaTitleStatus,
} from "@/lib/api.ts";
import {useToast} from "../../components/ui/Toast.tsx";
import {Button} from "../../components/ui/button.tsx";
import {media as ms} from "./shared/mediaStyles.ts";
import {MediaHero} from "./shared/MediaHero.tsx";
import {
    ContinueWatchingCard,
    MediaDetailPageSkeleton,
    MediaPosterCard,
    MediaRail,
} from "./shared/mediaRails.tsx";
import {TorrentRailCard} from "./shared/mediaShared.tsx";
import { MediaStatusBadge, statusKey } from "./shared/mediaStatus.tsx";

interface MediaLibraryTabProps {
    library: LibraryItem[];
    setLibrary: (l: LibraryItem[]) => void;
    libReady: boolean;
    torrentRail: TorrentRailItem[];
    pendingTitles: PendingMediaTitle[];
    watchlist: MediaPreference[];
    titleStatuses: MediaTitleStatus[];
    mediaHome: MediaHome;
    resume: ResumeItem[];
    onPlayResume: (it: ResumeItem) => void;
    listOnly?: boolean;
}

interface LibraryHeroProps {
    heroItem: LibraryItem | null;
    heroLabel: string | null;
    heroResume: ResumeItem | null;
    resume: ResumeItem[];
    openDetail: (it: LibraryItem, autoplay?: boolean) => void;
    onPlayResume: (it: ResumeItem) => void;
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
                                    pendingTitles,
                                    watchlist,
                                    titleStatuses,
                                    mediaHome,
                                    resume,
                                    onPlayResume,
                                    listOnly = false,
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
            it.tmdbId
                ? `/media/${it.type === "Series" ? "series" : "movie"}/${it.tmdbId}${
                autoplay ? `?autoplay=1&play=${encodeURIComponent(it.id)}` : ""
            }`
                : `/media/jellyfin/${it.type === "Series" ? "series" : "movie"}/${it.id}${
                    autoplay ? `?autoplay=1&play=${encodeURIComponent(it.id)}` : ""
                }`,
            {
                state: autoplay
                    ? {...returnState(), autoplay: true, autoplayItemId: it.id}
                    : returnState(),
            },
        );

    const openTorrentTitle = async (item: TorrentRailItem) => {
        nav(`/media/${item.kind === "series" ? "series" : "movie"}/${item.tmdbId}`, {
            state: returnState(),
        });
    };
    const openPendingTitle = (item: PendingMediaTitle) => {
        nav(`/media/${item.kind === "series" ? "series" : "movie"}/${item.tmdbId}`, {
            state: returnState(),
        });
    };

    const sortedLibrary = [...library].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const movieItems = sortedLibrary.filter((it) => it.type === "Movie");
    const seriesItems = sortedLibrary.filter((it) => it.type === "Series");
    const statusesByKey = new Map(titleStatuses.map((s) => [`${s.kind}:${s.tmdbId}`, s]));

    // Pick hero once when library loads; re-pick if library changes significantly
    const heroRef = useRef<LibraryItem | null>(null);
    if (heroRef.current === null && sortedLibrary.length > 0) {
        heroRef.current = getRandomItem(sortedLibrary);
    }
    const homeHero = mediaHome.hero;
    const heroItem = (homeHero
      ? sortedLibrary.find((it) => it.id === homeHero.jellyfinId || it.id === homeHero.seriesId || (homeHero.tmdbId && it.tmdbId === homeHero.tmdbId))
      : null) ?? heroRef.current;
    const heroResume = homeHero?.reason === "continue"
      ? resume.find((it) => it.id === homeHero.itemId) ?? null
      : null;

    const scan = async () => {
        await refreshJellyfin();
        await getMediaLibrary().then((l) => {
              setLibrary(l);
              toast.success("Скан библиотеки запущен");
        });
    }

    return (
        <div id="libraryContainer" className={ms.libPage}>
            {!libReady ? <MediaDetailPageSkeleton rows={2} /> : null}

            {libReady ? (
            <>
            {!listOnly && (
                <LibraryHero
                    heroItem={heroItem}
                    heroLabel={homeHero?.label ?? null}
                    heroResume={heroResume}
                    resume={resume}
                    openDetail={openDetail}
                    onPlayResume={onPlayResume}
                    scan={scan}
                />
            )}

            {watchlist.length > 0 && (
                <MediaRail title="МОЙ СПИСОК" countLabel={String(watchlist.length)} className={ms.section}>
                    {watchlist.map((it) => {
                        const key = statusKey(it.kind, it.tmdbId);
                        const status = key ? statusesByKey.get(key) : null;
                        const inLibrary = library.find((lib) => lib.tmdbId === it.tmdbId && (lib.type === "Series" ? "series" : "movie") === it.kind);
                        return (
                            <MediaPosterCard
                                key={`${it.kind}:${it.tmdbId}`}
                                title={it.title}
                                subtitle={`${it.kind === "series" ? "сериал" : "фильм"}${it.year ? ` · ${it.year}` : ""}`}
                                imageUrl={posterUrl(it.poster)}
                                rating={it.rating}
                                onClick={() => inLibrary ? openDetail(inLibrary) : nav(`/media/${it.kind}/${it.tmdbId}`, {state: returnState()})}
                                overlay={<MediaStatusBadge status={status} className="absolute bottom-2 left-2 right-2 justify-center" />}
                            />
                        );
                    })}
                </MediaRail>
            )}

            {!listOnly && torrentRail.length > 0 && (
                <MediaRail title="СКАЧИВАЕТСЯ / СКОРО В БИБЛИОТЕКЕ" countLabel={String(torrentRail.length)} className={ms.section}>
                    {torrentRail.map((it) => (
                        <TorrentRailCard key={it.infohash} item={it} onOpen={() => void openTorrentTitle(it)} />
                    ))}
                </MediaRail>
            )}

            {!listOnly && pendingTitles.length > 0 && (
                <MediaRail title="ДОБАВЛЕНО / ЖДЁТ РЕЛИЗА" countLabel={String(pendingTitles.length)} className={ms.section}>
                    {pendingTitles.map((it) => (
                        <MediaPosterCard
                            key={`${it.kind}:${it.tmdbId}`}
                            title={it.title}
                            subtitle={`${it.kind === "series" ? "сериал" : "фильм"} · ожидает релиз${it.year ? ` · ${it.year}` : ""}`}
                            imageUrl={posterUrl(it.poster)}
                            onClick={() => openPendingTitle(it)}
                        />
                    ))}
                </MediaRail>
            )}

            {!listOnly && resume.length > 0 && (
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

            {!listOnly && library.length === 0 ? (
                <div className={ms.railHeaderInset} style={{paddingTop: 24, paddingBottom: 24, color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12}}>
                    Библиотека пуста или ещё не отсканирована.
                </div>
            ) : !listOnly ? (
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
            ) : watchlist.length === 0 ? (
                <div className={ms.railHeaderInset} style={{paddingTop: 24, paddingBottom: 24, color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12}}>
                    Мой список пуст.
                </div>
            ) : null}
            </>
            ) : null}
        </div>
    );
}

function LibraryHero({heroItem, heroLabel, heroResume, resume, openDetail, onPlayResume, scan}: LibraryHeroProps) {
    const [heroDetail, setHeroDetail] = useState<HeroDetail>(null);

    useEffect(() => {
        if (!heroItem) return;
        setHeroDetail(null);
        if (heroItem.type === "Movie") {
            heroItem.tmdbId
                ? getMediaTitleDetail("movie", heroItem.tmdbId).then(setHeroDetail)
                : getMoviePageDetail(heroItem.id).then(setHeroDetail);
        } else {
            heroItem.tmdbId
                ? getMediaTitleDetail("series", heroItem.tmdbId).then(setHeroDetail)
                : getSeriesPageDetail(heroItem.id).then(setHeroDetail);
        }
    }, [heroItem?.id]);

    if (!heroItem) return null;

    // Cross-reference with resume list
    const resumeItem = heroResume ?? resume.find((r) => r.id === heroItem.id);
    const isResuming = !!resumeItem;
    const playHero = () => {
        if (resumeItem) onPlayResume(resumeItem);
        else openDetail(heroItem, true);
    };

    const overview = heroDetail?.overview ?? null;
    const genres = heroDetail?.genres ?? [];
    const rating = heroDetail?.rating ?? null;
    const runtime = heroDetail?.runtime ?? null;

    return (
        <MediaHero
            title={heroItem.name}
            eyebrow={heroLabel?.toUpperCase() ?? (isResuming ? "ПРОДОЛЖИТЬ ПРОСМОТР" : "В БИБЛИОТЕКЕ")}
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
                    <Button
                        className={ms.playButton}
                        onClick={(e) => { e.stopPropagation(); playHero(); }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="6,3 21,12 6,21"/>
                        </svg>
                        Смотреть
                    </Button>
                    <Button
                        className={ms.heroGhostBtn}
                        onClick={(e) => { e.stopPropagation(); openDetail(heroItem); }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9"/>
                            <path d="M12 8h.01M11 12h1v4h1"/>
                        </svg>
                        Подробнее
                    </Button>
                    <Button
                      className={ms.heroGhostBtn}
                      loadingLabel="Сканируем"
                      onClick={(e) => { e.stopPropagation(); return scan(); }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M3 12h18"/>
                        </svg>
                        Сканировать
                    </Button>
                </>
            }
        />
    );
}
