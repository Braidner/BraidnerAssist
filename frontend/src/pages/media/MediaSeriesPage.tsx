// Детальная страница сериала (/media/series/:id) — TMDB/Jellyfin detail: шапка,
// сезоны/эпизоды, встроенный плеер, поиск релизов и rail привязанных раздач.

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  ReleasePicker,
  TorrentRailCard,
} from "./shared/mediaShared.tsx";
import {
  DetailHero,
  SimilarRail,
  CardRail,
  tmdbRailCards,
  type DetailPlayer,
  type QueueItem,
} from "./shared/mediaDetail.tsx";
import { MediaDetailPageSkeleton, MediaRail } from "./shared/mediaRails.tsx";
import { cn } from "../../lib/cn.ts";
import { media as ms } from "./shared/mediaStyles.ts";
import {
  getSeriesPageDetail,
  getSeriesDiscoverDetail,
  getMediaTitleDetail,
  addTitle,
  getMediaPlayUrl,
  jellyfinPosterUrl,
  posterUrl,
  getMediaLibrary,
  getDiscoverSimilar,
  getTitleTorrents,
  backdropUrl,
  type SeriesPageDetail,
  type MediaData,
  type LibraryItem,
  type TmdbItem,
  type TorrentRailItem,
} from "@/lib/api.ts";
import { useToast } from "../../components/ui/Toast.tsx";
import { Button } from "../../components/ui/button.tsx";

type AutoplayLocationState = {
  from?: string;
  scrollY?: number;
  mediaReturn?: boolean;
  autoplay?: boolean;
  autoplayItemId?: string;
  autoplayTitle?: string;
} | null;
const fmtAir = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU") : "";

// Относительная дата выхода: «сегодня/завтра/вчера/через N дн/дата».
function relAir(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((t - Date.now()) / 86_400_000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  if (diff > 1 && diff <= 21) return `через ${diff} дн`;
  return new Date(iso).toLocaleDateString("ru-RU");
}
const isAired = (iso: string | null) =>
  Boolean(iso && new Date(iso).getTime() < Date.now());

export function MediaSeriesPage({
  media,
  onMediaUpdate,
  source = "tmdb",
}: {
  media: MediaData;
  onMediaUpdate: () => void;
  source?: "tmdb" | "jellyfin" | "discover";
}) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [d, setD] = useState<SeriesPageDetail | null | "loading">("loading");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [player, setPlayer] = useState<DetailPlayer>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [act, setAct] = useState<string | null>(null);
  const [pickerSeason] = useState<number | null>(null);
  const [showAllPicker, setShowAllPicker] = useState(false);
  const [queuedInLibrary, setQueuedInLibrary] = useState(false);
  const [titleTorrents, setTitleTorrents] = useState<TorrentRailItem[]>([]);
  const autoplayConsumedRef = useRef<string | null>(null);
  const locationState = location.state as AutoplayLocationState;
  const backTarget = locationState?.from ?? (source === "discover" ? "/media/discover" : "/media");
  const goBack = () => {
    if (locationState?.mediaReturn || locationState?.from) {
      nav(-1);
      return;
    }
    nav(backTarget, { replace: true });
  };

  // Основной маршрут использует TMDB id; legacy routes оставлены для старых ссылок.
  const fetchDetail = () =>
    source === "jellyfin"
      ? getSeriesPageDetail(id)
      : source === "discover"
        ? getSeriesDiscoverDetail(Number(id), { idType: "tvdb" })
        : getMediaTitleDetail("series", Number(id), { idType: "auto" });

  useEffect(() => {
    setD("loading");
    setQueuedInLibrary(false);
    fetchDetail().then((r) => setD(r));
    getMediaLibrary().then(setLibrary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source]);

  useEffect(() => {
    if (source === "jellyfin" || d === "loading" || !d?.tmdbId) return;
    const routeId = Number(id);
    if (!Number.isFinite(routeId) || routeId === d.tmdbId) return;
    nav(`/media/series/${d.tmdbId}${location.search}`, {
      replace: true,
      state: location.state,
    });
  }, [d, id, location.search, location.state, nav, source]);

  const play = async (jellyfinId: string, title: string) => {
    let playInfo = null;
    try {
      setBusy(jellyfinId);
      playInfo = await getMediaPlayUrl(jellyfinId);
    } finally {
      setBusy(null);
    }
    if (playInfo) {
      if (playInfo.reason === "jellyfin_auth_required") {
        toast.error("Jellyfin не принял учётку для сохранения прогресса. Перелогинься или обнови пароль в настройках.");
      }
      setPlayer({
        itemId: jellyfinId,
        url: playInfo.url,
        title,
        playSessionId: playInfo.playSessionId,
        mediaSourceId: playInfo.mediaSourceId,
      });
      setActiveEpisodeId(jellyfinId);
    } else {
      toast.error("Не удалось запустить воспроизведение");
    }
  };

  // TMDB-похожие для сериала. Основной путь теперь всегда работает по TMDB id.
  const [tmdbSimilar, setTmdbSimilar] = useState<TmdbItem[]>([]);
  const detTvdbId = d && d !== "loading" ? d.tvdbId : null;
  const detTmdbId = d && d !== "loading" ? d.tmdbId : null;
  const refreshTitleTorrents = () => {
    if (detTmdbId == null) {
      setTitleTorrents([]);
      return;
    }
    getTitleTorrents("series", detTmdbId).then(setTitleTorrents);
  };
  useEffect(() => {
    if (!media.tmdb || (detTmdbId == null && detTvdbId == null)) {
      setTmdbSimilar([]);
      return;
    }
    if (detTmdbId != null) getDiscoverSimilar("series", detTmdbId).then(setTmdbSimilar);
    else if (detTvdbId != null) getDiscoverSimilar("series", detTvdbId, "tvdb").then(setTmdbSimilar);
  }, [media.tmdb, detTmdbId, detTvdbId]);

  useEffect(() => {
    refreshTitleTorrents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detTmdbId]);

  const openTmdb = (it: TmdbItem) => {
    nav(`/media/${it.kind === "movie" ? "movie" : "series"}/${it.tmdbId}`);
  };

  useEffect(() => {
    const state = location.state as AutoplayLocationState;
    const shouldAutoplay =
      state?.autoplay || searchParams.get("autoplay") === "1";
    if (d === "loading" || !d || !shouldAutoplay) return;

    const requestedId = searchParams.get("play") ?? state?.autoplayItemId;
    const playable = d.seasons
      .flatMap((season) =>
        season.episodes
          .filter((ep) => ep.jellyfinId)
          .map((ep) => ({
            jellyfinId: ep.jellyfinId as string,
            title: `${d.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber ?? 0,
            played: ep.played,
          })),
      )
      .sort(
        (a, b) =>
          a.seasonNumber - b.seasonNumber ||
          a.episodeNumber - b.episodeNumber,
      );
    const target =
      (requestedId
        ? playable.find((ep) => ep.jellyfinId === requestedId)
        : null) ??
      playable.find((ep) => !ep.played) ??
      playable[0];
    if (!target) return;

    const key = `${source}:${id}:${target.jellyfinId}`;
    if (autoplayConsumedRef.current === key) return;
    autoplayConsumedRef.current = key;

    void play(target.jellyfinId, searchParams.get("title") ?? state?.autoplayTitle ?? target.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, id, location.state, searchParams, source]);

  if (d === "loading")
    return (
      <div className={ms.page}>
        <MediaDetailPageSkeleton rows={3} />
      </div>
    );
  if (!d)
    return (
      <div className={ms.page}>
        <div className={cn(ms.empty, "mt-10")}>
          Не удалось загрузить сериал.
        </div>
      </div>
    );

  const det = d;

  const episodeQueue: QueueItem[] = det.seasons
    .flatMap((season) =>
      season.episodes
        .filter((ep) => ep.jellyfinId)
        .map((ep) => ({
          jellyfinId: ep.jellyfinId as string,
          title: `${det.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`,
          seasonNumber: ep.seasonNumber,
          episodeNumber: ep.episodeNumber ?? 0,
        })),
    )
    .sort(
      (a, b) =>
        a.seasonNumber - b.seasonNumber ||
        a.episodeNumber - b.episodeNumber,
    )
    .map(({ jellyfinId, title }) => ({ jellyfinId, title }));
  const playableEpisodes = det.seasons
    .flatMap((season) =>
      season.episodes
        .filter((ep) => ep.jellyfinId)
        .map((ep) => ({
          jellyfinId: ep.jellyfinId as string,
          title: `${det.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`,
          label: `S${ep.seasonNumber}E${ep.episodeNumber}`,
          seasonNumber: ep.seasonNumber,
          episodeNumber: ep.episodeNumber ?? 0,
          played: ep.played,
        })),
    )
    .sort(
      (a, b) =>
        a.seasonNumber - b.seasonNumber ||
        a.episodeNumber - b.episodeNumber,
    );
  const firstUnplayedEpisode = playableEpisodes.find((ep) => !ep.played);
  const watchTarget = firstUnplayedEpisode ?? playableEpisodes[0] ?? null;
  const hasStartedWatching = playableEpisodes.some((ep) => ep.played);
  const watchLabel = watchTarget
    ? firstUnplayedEpisode
      ? hasStartedWatching
        ? `Продолжить с ${watchTarget.label}`
        : `Смотреть с ${watchTarget.label}`
      : "Смотреть с начала"
    : "Смотреть";
  const activeIndex = activeEpisodeId
    ? episodeQueue.findIndex((item) => item.jellyfinId === activeEpisodeId)
    : -1;
  const previousItem = activeIndex > 0 ? episodeQueue[activeIndex - 1] : null;
  const nextItem =
    activeIndex >= 0 ? (episodeQueue[activeIndex + 1] ?? null) : null;
  const tmdbId = det.tmdbId;

  const addToLib = async () => {
    if (tmdbId == null) return;
    let ok = false;
    try {
      setAct("add");
      ok = await addTitle("series", tmdbId);
    } finally {
      setAct(null);
    }
    if (ok) {
      toast.success(`«${det.title}» добавлен в библиотеку — ищем релиз`);
      setShowAllPicker(true);
      onMediaUpdate();
      fetchDetail().then(setD);
    } else toast.error("Не удалось добавить в библиотеку");
  };

  // Похожие — из библиотеки по жанрам
  const similarItems = library
    .filter((x) => x.id !== id && x.type === "Series")
    .slice(0, 8);
  const inLibrary = det.inLibrary || Boolean(det.jellyfinId);
  const libraryState = inLibrary || queuedInLibrary || titleTorrents.length > 0;

  const posterSrc = det.posterRemote
    ? posterUrl(det.posterRemote)
    : det.jellyfinId
      ? jellyfinPosterUrl(det.jellyfinId)
      : undefined;
  const backdropSrc = det.backdropRemote
    && !det.jellyfinId
    ? backdropUrl(det.backdropRemote)
    : undefined;

  return (
    <div>
      <div className={ms.page}>
        <DetailHero
          kindLabel="СЕРИАЛ"
          title={det.title}
          jellyfinId={det.jellyfinId}
          backdropSrc={backdropSrc}
          posterSrc={posterSrc}
          player={player}
          overview={det.overview}
          year={det.year}
          runtimeLabel={det.runtime ? `${det.runtime} мин / эп.` : null}
          rating={det.rating}
          genres={det.genres}
          actions={
            <>
              {watchTarget && (
                <Button
                  className={ms.playButton}
                  loading={busy === watchTarget.jellyfinId}
                  title={watchTarget?.title}
                  onClick={() => play(watchTarget.jellyfinId, watchTarget.title)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="6,3 21,12 6,21" />
                  </svg>
                  {watchLabel}
                </Button>
              )}
              {!libraryState && tmdbId != null && (
                <Button
                  className={ms.playButton}
                  loading={act === "add"}
                  loadingLabel="Добавляем"
                  onClick={addToLib}
                >
                  <Plus className="size-4" strokeWidth={2.3} />
                  В библиотеку
                </Button>
              )}
              {libraryState && (
                <Button
                  className={ms.heroGhostBtn}
                  type="button"
                  title={queuedInLibrary && !inLibrary ? "Релиз отправлен на загрузку" : "Тайтл уже в медиатеке"}
                  autoLoading={false}
                >
                  <CheckCircle2 className="size-4 text-accent" strokeWidth={2.1} />
                  В библиотеке
                </Button>
              )}
              {tmdbId != null && (
                <Button
                  className={ms.heroGhostBtn}
                  title="Поиск всех раздач сериала (включая мультисезонные паки)"
                  onClick={() => setShowAllPicker((v) => !v)}
                >
                  {showAllPicker ? "Скрыть поиск" : "Найти"}
                </Button>
              )}
            </>
          }
          previousItem={previousItem}
          nextItem={nextItem}
          onBack={goBack}
          onQueueClick={() => setShowAllPicker((v) => !v)}
          onPlayQueueItem={(item) => play(item.jellyfinId, item.title)}
          onClosePlayer={() => {
            setPlayer(null);
            setActiveEpisodeId(null);
          }}
        />
      </div>
      {showAllPicker && tmdbId != null && (
        <div style={{ marginTop: 16 }}>
          <ReleasePicker
            params={{ type: "series", id: tmdbId }}
            downloads={media.downloads}
            fallbackPosterSrc={posterSrc}
            onGrabbed={() => {
              setQueuedInLibrary(true);
              onMediaUpdate();
              refreshTitleTorrents();
              window.setTimeout(refreshTitleTorrents, 2_000);
            }}
          />
        </div>
      )}

      {/* Season rails */}
      {det.seasons.length === 0 ? (
        <div className={cn(ms.empty, "mt-6")}>Эпизоды не найдены.</div>
      ) : (
        <div className="mb-10 space-y-8" style={{ marginTop: 24 }}>
          {det.seasons.map((s) => {
            if (s.seasonNumber === 0) {
              return null
            }
            const pickerOn = pickerSeason === s.seasonNumber;
            const label =
              s.seasonNumber === 0
                ? "Спецвыпуски"
                : `Сезон ${s.seasonNumber}`;
            return (
              <div key={s.seasonNumber}>
                <MediaRail title={label} countLabel={`${s.fileCount}/${s.totalCount}`} className="mt-0">
                      {s.episodes.map((ep) => {
                        const missed = !ep.hasFile && isAired(ep.airDate);
                        const episodeImage = ep.jellyfinId
                          ? jellyfinPosterUrl(ep.jellyfinId)
                          : ep.stillRemote
                            ? posterUrl(ep.stillRemote, "w342")
                            : null;
                        return (
                      <article
                        key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                        className={cn(
                          "group relative flex h-[150px] w-[280px] flex-none overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.035] text-left transition-all hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.055]",
                          ep.played ? "media-ep-played" : "",
                        )}
                      >
                        {episodeImage ? (
                          <img
                            className="absolute inset-0 z-0 size-full object-cover opacity-55 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                            src={episodeImage}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="absolute inset-0 z-0 bg-groove" />
                        )}
                        <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_top,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.50)_54%,rgba(0,0,0,0.20)_100%),linear-gradient(to_right,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.22)_70%,transparent_100%)]" />
                        <div className="relative z-[2] flex min-w-0 flex-1 flex-col gap-2 p-3">
                          <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-2xs uppercase tracking-2 text-white/62">
                                  S{String(ep.seasonNumber).padStart(2, "0")}E{String(ep.episodeNumber ?? 0).padStart(2, "0")}
                                </span>
                            <span
                              className={cn(
                                "whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-2xs",
                                ep.hasFile
                                  ? "bg-white/[0.12] text-white"
                                  : missed
                                    ? "bg-black/45 text-[#ff8a8a]"
                                    : "bg-black/45 text-white/58",
                              )}
                            >
                                  {ep.hasFile ? "есть" : missed ? "пропущено" : "нет файла"}
                                </span>
                          </div>
                          <div className="line-clamp-2 text-row font-semibold text-white" title={ep.title}>
                            {ep.title}
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-2">
                                <span className="truncate font-mono text-2xs text-white/58" title={fmtAir(ep.airDate)}>
                                  {relAir(ep.airDate)}
                                </span>
                            <button
                              className="grid h-8 w-8 flex-none place-items-center rounded-full border border-white/[0.18] bg-black/25 text-white/78 backdrop-blur-md transition-all hover:border-transparent hover:bg-[var(--epa,var(--accent))] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                              title={ep.jellyfinId ? "Воспроизвести" : "Файл недоступен"}
                              disabled={!ep.jellyfinId || busy === ep.jellyfinId}
                              onClick={() =>
                                ep.jellyfinId &&
                                play(
                                  ep.jellyfinId,
                                  `${det.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`,
                                )
                              }
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="6,3 21,12 6,21" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </MediaRail>

                {pickerOn && tmdbId != null && (
                  <div className="mx-7 mt-4 md:mx-10">
                    <ReleasePicker
                      params={{
                        type: "series",
                        id: tmdbId,
                        seasonNumber: s.seasonNumber,
                      }}
                      downloads={media.downloads}
                      fallbackPosterSrc={posterSrc}
                      onGrabbed={() => {
                        setQueuedInLibrary(true);
                        onMediaUpdate();
                        refreshTitleTorrents();
                        window.setTimeout(refreshTitleTorrents, 2_000);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tmdbSimilar.length > 0 ? (
        <CardRail label="ПОХОЖИЕ" cards={tmdbRailCards(tmdbSimilar, openTmdb)} />
      ) : (
        <SimilarRail items={similarItems} />
      )}

      {titleTorrents.length > 0 && (
        <MediaRail title="Медиа" countLabel={String(titleTorrents.length)} className="mb-10">
          {titleTorrents.map((it) => (
            <TorrentRailCard key={it.infohash} item={it} />
          ))}
        </MediaRail>
      )}

    </div>
  );
}
