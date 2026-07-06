// Страница /media — shell: state, polling, tab routing.
// Tab components: MediaLibraryTab, MediaDiscoverTab, MediaSystemTab.

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRegisterTabs } from "../../lib/tabsContext.tsx";
import { Placeholder } from "../../components/panels/Placeholder.tsx";
import {
  getMediaLibrary,
  getTorrentRail,
  getPendingMediaTitles,
  addTorrent,
  torrentAction,
  lookupTitle,
  addTitle,
  searchReleases,
  posterUrl,
  getDiscoverRails,
  getDiscoverBecause,
  saveMediaPreference,
  discoverSearch,
  tmdbSearch,
  torrserverAdd,
  torrserverList,
  torrserverRemove,
  torrserverStreamUrl,
  getContinueWatching,
  getMediaHome,
  getMediaPreferences,
  getMediaTitleStatuses,
  refreshJellyfin,
  type MediaData,
  type DownloadItem,
  type TorrentRailItem,
  type PendingMediaTitle,
  type LibraryItem,
  type SearchResult,
  type MediaLookupItem,
  type TorrServerStream,
  type ResumeItem,
  type TmdbItem,
  type DiscoverHome,
  type DiscoverRail,
  type MediaHome,
  type MediaPreference,
  type MediaTitleStatus,
} from "@/lib/api.ts";
import {
  ReleasePicker,
  Player,
  fmtSize,
} from "./shared/mediaShared.tsx";
import { useToast } from "../../components/ui/Toast.tsx";
import { Button } from "../../components/ui/button.tsx";
import { MediaLibraryTab } from "./MediaLibraryTab.tsx";
import { MediaDiscoverTab } from "./MediaDiscoverTab.tsx";
import { MediaSystemTab } from "./MediaSystemTab.tsx";
import { cn } from "../../lib/cn.ts";
import { ui } from "@/lib/ui.ts";
import { media as ms } from "./shared/mediaStyles.ts";

// Дравер «Добавить»: основной путь — TMDB → выбор релиза; ниже — ручные опции
// (прямой magnet + raw-поиск Jackett).
function AddTorrentDrawer({
  open,
  onClose,
  onAdd,
  onAddTitle,
  onGrabbed,
  onWatchNow,
  torrserver,
  downloads,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (url: string, key: string) => Promise<void>;
  onAddTitle: (item: MediaLookupItem, key: string) => Promise<boolean>;
  onGrabbed: () => void;
  onWatchNow: (url: string, title: string, key: string) => Promise<void>;
  torrserver: boolean;
  downloads: DownloadItem[];
  busy: string | null;
}) {
  const [kind, setKind] = useState<"movie" | "series">("movie");
  const [titleQuery, setTitleQuery] = useState("");
  const [titleResults, setTitleResults] = useState<MediaLookupItem[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [addedIds, setAddedIds] = useState<Record<number, boolean>>({});
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickSeason, setPickSeason] = useState(1);

  const [showManual, setShowManual] = useState(false);
  const [magnet, setMagnet] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onLookup = async () => {
    const q = titleQuery.trim();
    if (!q) return;
    try {
      setLookingUp(true);
      setTitleResults(await lookupTitle(kind, q));
    } finally {
      setLookingUp(false);
    }
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    try {
      setSearching(true);
      setSearchError(null);
      const res = await searchReleases(q);
      setResults(res.items);
      setSearchError(res.error);
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "pointer-events-none opacity-0",
          ui.overlay,
          open && "pointer-events-auto opacity-100",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          ui.drawer,
          "translate-x-full transition-transform duration-300",
          open && "translate-x-0",
        )}
      >
        <div className={ui.drawerInner}>
          <div className={ui.drawerHead}>
            <span className={ui.drawerKind}>Добавить в медиатеку</span>
            <Button
              className={cn(ui.button.base, ui.button.iconSm)}
              onClick={onClose}
            >
              ✕
            </Button>
          </div>

          {/* Основной путь: TMDB → поиск и выбор релиза */}
          <div className={ms.seg}>
            <button
              className={cn(ms.segButton, kind === "movie" && ms.segButtonOn)}
              onClick={() => {
                setKind("movie");
                setTitleResults([]);
              }}
            >
              Фильм
            </button>
            <button
              className={cn(ms.segButton, kind === "series" && ms.segButtonOn)}
              onClick={() => {
                setKind("series");
                setTitleResults([]);
              }}
            >
              Сериал
            </button>
          </div>
          <div className={ms.field}>
            <input
              className={ms.input}
              placeholder={
                kind === "movie" ? "Название фильма…" : "Название сериала…"
              }
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onLookup();
              }}
            />
            <Button
              className={ms.button.accentIcon}
              disabled={!titleQuery.trim() || lookingUp}
              loading={lookingUp}
              onClick={onLookup}
            >
              🔍
            </Button>
          </div>

          {titleResults.length > 0 && (
            <div className={ms.list}>
              {titleResults.map((it) => {
                const isAdded = it.added || addedIds[it.id];
                const key = `title-${it.id}`;
                const pickerOn = pickerFor === it.id;
                return (
                  <div key={it.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-[11px] rounded-xl border border-hair bg-surface px-3 py-2.5">
                      <div className="grid h-[63px] w-[42px] flex-none place-items-center overflow-hidden rounded-[7px] bg-groove">
                        {it.poster ? (
                          <img
                            className="h-full w-full object-cover"
                            src={posterUrl(it.poster)}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-xl opacity-50">
                            {kind === "movie" ? "🎬" : "📺"}
                          </span>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span
                          className="truncate whitespace-nowrap text-body font-medium text-ink"
                          title={it.title}
                        >
                          {it.title}
                          {it.year ? ` (${it.year})` : ""}
                        </span>
                        {it.overview && (
                          <span className="line-clamp-2 text-data leading-[1.35] text-muted">
                            {it.overview}
                          </span>
                        )}
                        <div className="mt-1 flex gap-2">
                          <Button
                            className={ms.button.accentSm}
                            disabled={isAdded || busy === key}
                            loading={busy === key}
                            onClick={async () => {
                              const ok = await onAddTitle(it, key);
                              if (ok)
                                setAddedIds((p) => ({ ...p, [it.id]: true }));
                            }}
                          >
                            {isAdded ? "В библиотеке" : "Добавить"}
                          </Button>
                          <Button
                            className={ms.button.sm}
                            onClick={() =>
                              setPickerFor(pickerOn ? null : it.id)
                            }
                          >
                            {pickerOn ? "Скрыть раздачи" : "Выбрать раздачу"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {pickerOn && (
                      <div className="px-0.5 pb-2 pt-1">
                        {it.kind === "series" && (
                          <div className={cn(ms.field, "items-center")}>
                            <span className={cn(ms.label, "m-0")}>Сезон</span>
                            <input
                              className={cn(ms.input, "w-[70px] flex-none")}
                              type="number"
                              min={1}
                              value={pickSeason}
                              onChange={(e) =>
                                setPickSeason(
                                  Math.max(0, Number(e.target.value) || 1),
                                )
                              }
                            />
                          </div>
                        )}
                        <ReleasePicker
                          params={
                            it.kind === "series"
                              ? {
                                  type: "series",
                                  id: it.id,
                                  seasonNumber: pickSeason,
                                }
                              : { type: "movie", id: it.id }
                          }
                          downloads={downloads}
                          onGrabbed={onGrabbed}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!lookingUp && titleQuery.trim() && titleResults.length === 0 && (
            <div className={cn(ms.empty, "mt-3")}>Ничего не найдено.</div>
          )}

          {/* Ручные опции — прямой magnet и сырой поиск Jackett */}
          <button
            className={ms.subtleToggle}
            onClick={() => setShowManual((v) => !v)}
          >
            {showManual ? "▾" : "▸"} Вручную (magnet / Jackett)
          </button>

          {showManual && (
            <>
              <div className={ms.label}>
                Прямая ссылка (magnet или .torrent)
              </div>
              <div className={ms.field}>
                <input
                  className={ms.input}
                  placeholder="magnet:… или https://….torrent"
                  value={magnet}
                  onChange={(e) => setMagnet(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && magnet.trim())
                      onAdd(magnet.trim(), "magnet").then(() => setMagnet(""));
                  }}
                />
                <Button
                  className={ms.button.accentIcon}
                  disabled={!magnet.trim() || busy === "magnet"}
                  loading={busy === "magnet"}
                  onClick={() =>
                    onAdd(magnet.trim(), "magnet").then(() => setMagnet(""))
                  }
                >
                  +
                </Button>
              </div>

              <div className={ms.label}>Поиск релизов (Jackett)</div>
              <div className={ms.field}>
                <input
                  className={ms.input}
                  placeholder="Название релиза…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSearch();
                  }}
                />
                <Button
                  className={ms.button.accentIcon}
                  disabled={!query.trim() || searching}
                  loading={searching}
                  onClick={onSearch}
                >
                  🔍
                </Button>
              </div>

              {searchError && (
                <div className={cn(ms.empty, "mt-3.5 text-bad")}>{searchError}</div>
              )}

              {!searchError && results.length > 0 && (
                <div className={ms.list}>
                  {results.map((r) => (
                    <div key={r.guid} className={ms.row}>
                      <span className={ms.rowTitle} title={r.title}>
                        {r.title}
                      </span>
                      <div className={ms.rowFoot}>
                        <span className={ms.rowMeta}>
                          {fmtSize(r.size)} ·{" "}
                          <span className={ms.okText}>{r.seeders} seed</span> ·{" "}
                          {r.indexer}
                          {r.query ? ` · q: ${r.query}` : ""}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {torrserver && (
                            <Button
                              className={ms.button.sm}
                              disabled={!r.url || busy === r.guid + "ts"}
                              loading={busy === r.guid + "ts"}
                              title="Смотреть сейчас через TorrServer (без полной загрузки)"
                              onClick={() => {
                                if (!r.url) return;
                                return onWatchNow(r.url, r.title, r.guid + "ts");
                              }}
                            >
                              ▶ Сейчас
                            </Button>
                          )}
                          <Button
                            className={ms.button.accentSm}
                            disabled={!r.url || busy === r.guid}
                            loading={busy === r.guid}
                            onClick={() => {
                              if (!r.url) return;
                              return onAdd(r.url, r.guid);
                            }}
                          >
                            Скачать
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!searchError && !searching && query.trim() && results.length === 0 && (
                <div className={cn(ms.empty, "mt-3.5")}>Ничего не найдено.</div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

type MediaTab = "library" | "list" | "discover" | "system";
const TAB_KEYS: MediaTab[] = ["library", "list", "discover", "system"];
const TAB_ROUTES: Record<MediaTab, string> = {
  library: "/media",
  list: "/media/list",
  discover: "/media/discover",
  system: "/media/system",
};

export function MediaPage({
  media,
  onMediaUpdate,
  tab = "library",
  allowSystem = true,
}: {
  media: MediaData;
  onMediaUpdate: () => void;
  tab?: MediaTab;
  allowSystem?: boolean;
}) {
  const nav = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const from = `${location.pathname}${location.search}`;
  const returnState = () => ({
    from,
    scrollY: window.scrollY,
    mediaReturn: true,
  });

  useEffect(() => {
    const legacyTab = new URLSearchParams(location.search).get("tab") as MediaTab | null;
    if (legacyTab && TAB_ROUTES[legacyTab]) {
      nav(TAB_ROUTES[legacyTab], { replace: true });
    }
  }, [location.search, nav]);

  const visibleTabs = allowSystem ? TAB_KEYS : TAB_KEYS.filter((key) => key !== "system");
  const visibleLabels = allowSystem
    ? ["Библиотека", "Мой список", "Дискавери", "Система"]
    : ["Библиотека", "Мой список", "Дискавери"];

  useRegisterTabs(
    visibleLabels,
    Math.max(0, visibleTabs.indexOf(tab)),
    (i: number) => nav(TAB_ROUTES[visibleTabs[i]]),
  );

  // ── Shared state ──────────────────────────────────────────────────────────
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [torrentRail, setTorrentRail] = useState<TorrentRailItem[]>([]);
  const [pendingTitles, setPendingTitles] = useState<PendingMediaTitle[]>([]);
  const [watchlist, setWatchlist] = useState<MediaPreference[]>([]);
  const [titleStatuses, setTitleStatuses] = useState<MediaTitleStatus[]>([]);
  const [mediaHome, setMediaHome] = useState<MediaHome>({ hero: null });
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [player, setPlayer] = useState<{
    url: string;
    title: string;
    direct: boolean;
  } | null>(null);
  const [tsStreams, setTsStreams] = useState<TorrServerStream[]>([]);
  const [magnet, setMagnet] = useState("");
  const [libReady, setLibReady] = useState(false);

  // Library data
  useEffect(() => {
    if (media.configured)
      getMediaLibrary().then((l) => {
        setLibrary(l);
        setLibReady(true);
      });
  }, [media.configured]);

  useEffect(() => {
    if (!media.configured) return;
    let alive = true;
    const load = () =>
      Promise.all([getTorrentRail(), getPendingMediaTitles(), getMediaTitleStatuses(), getMediaHome(), getMediaPreferences("watchlist")]).then(([items, pending, statuses, home, prefs]) => {
        if (!alive) return;
        setTorrentRail(items);
        setPendingTitles(pending);
        setTitleStatuses(statuses);
        setMediaHome(home);
        setWatchlist(prefs);
      });
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [media.configured, media.downloads]);

  // Discovery home (LAMPA/ZONA-style rails: hero + genres + rails + because-you-watched)
  const [discoverHome, setDiscoverHome] = useState<DiscoverHome>({
    configured: false,
    hero: null,
    genres: {movie: [], series: []},
    rails: [],
  });
  const [because, setBecause] = useState<DiscoverRail[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const refreshDiscover = async () => {
    if (!media.configured) return;
    try {
      setHomeLoading(true);
      const home = await getDiscoverRails();
      setDiscoverHome(home);
      if (home.configured) getDiscoverBecause().then(setBecause);
    } finally {
      setHomeLoading(false);
    }
  };
  useEffect(() => {
    if (media.configured) refreshDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.configured]);

  // Discovery search state (TMDB or *arr)
  const [dq, setDq] = useState("");
  const [dres, setDres] = useState<MediaLookupItem[]>([]);
  const [tmRes, setTmRes] = useState<TmdbItem[]>([]);
  const [dsearching, setDsearching] = useState(false);
  useEffect(() => {
    const q = dq.trim();
    if (q.length < 2) {
      setDres([]);
      setTmRes([]);
      setDsearching(false);
      return;
    }
    setDsearching(true);
    const t = setTimeout(() => {
      if (media.tmdb)
        tmdbSearch(q).then((r) => {
          setTmRes(r);
          setDsearching(false);
        });
      else
        discoverSearch(q).then((r) => {
          setDres(r);
          setDsearching(false);
        });
    }, 350);
    return () => clearTimeout(t);
  }, [dq, media.tmdb]);

  // Continue watching
  const [resume, setResume] = useState<ResumeItem[]>([]);
  useEffect(() => {
    if (media.configured) getContinueWatching().then(setResume);
  }, [media.configured]);

  // TorrServer streams
  const refreshTs = () => {
    if (media.torrserver) torrserverList().then(setTsStreams);
  };
  useEffect(() => {
    if (media.torrserver) torrserverList().then(setTsStreams);
  }, [media.torrserver]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const playResume = async (it: ResumeItem) => {
    if (it.kind === "movie") {
      nav(`/media/jellyfin/movie/${it.id}?autoplay=1&play=${encodeURIComponent(it.id)}&title=${encodeURIComponent(it.title)}`, {
        state: { ...returnState(), autoplay: true, autoplayItemId: it.id, autoplayTitle: it.title },
      });
      return;
    }
    if (it.seriesId) {
      nav(`/media/jellyfin/series/${it.seriesId}?autoplay=1&play=${encodeURIComponent(it.id)}&title=${encodeURIComponent(it.title)}`, {
        state: { ...returnState(), autoplay: true, autoplayItemId: it.id, autoplayTitle: it.title },
      });
      return;
    }

    toast.error("Не удалось открыть страницу сериала для продолжения просмотра");
  };

  const onWatchNow = async (url: string, title: string, key: string) => {
    if (!media.torrserver) return;
    let info = null;
    try {
      setBusy(key);
      info = await torrserverAdd(url, title);
    } finally {
      setBusy(null);
    }
    if (!info || !info.file) {
      toast.error("TorrServer: не удалось получить видеофайл");
      return;
    }
    refreshTs();
    if (!info.file.playable)
      toast.info(
        "Формат не для браузера — используй «Ссылка»/«.m3u» во внешнем плеере",
      );
    setPlayer({
      url: torrserverStreamUrl(info.hash, info.file.index),
      title: info.title || title,
      direct: true,
    });
  };

  const removeStream = async (hash: string) => {
    let ok = false;
    try {
      setBusy("tsrm" + hash);
      ok = await torrserverRemove(hash);
    } finally {
      setBusy(null);
    }
    if (ok) {
      toast.success("Стрим остановлен");
      refreshTs();
    } else toast.error("Не удалось остановить стрим");
  };

  const onAdd = async (url: string, key: string) => {
    let ok = false;
    try {
      setBusy(key);
      ok = await addTorrent(url);
    } finally {
      setBusy(null);
    }
    if (ok) {
      toast.success("Торрент добавлен в qBittorrent");
      onMediaUpdate();
    } else toast.error("Не удалось добавить торрент");
  };

  const onAddTitle = async (
    item: MediaLookupItem,
    key: string,
  ): Promise<boolean> => {
    let ok = false;
    try {
      setBusy(key);
      ok = await addTitle(item.kind, item.id);
    } finally {
      setBusy(null);
    }
    if (ok) {
      toast.success(`«${item.title}» добавлен — ищем релиз`);
      onMediaUpdate();
      getPendingMediaTitles().then(setPendingTitles);
    } else toast.error("Не удалось добавить тайтл");
    return ok;
  };

  const onAddTmdb = async (it: TmdbItem) => {
    const item: MediaLookupItem = {
      kind: it.kind,
      id: it.tmdbId,
      title: it.title,
      year: it.year,
      overview: it.overview,
      poster: it.poster,
      added: false,
    };
    await onAddTitle(item, "tmdbadd" + it.tmdbId);
  };

  const onPreference = async (
    it: TmdbItem,
    status: "watchlist" | "hidden" | "liked" | "disliked",
  ) => {
    let pref = null;
    try {
      setBusy("pref" + it.tmdbId + status);
      pref = await saveMediaPreference(it, status);
    } finally {
      setBusy(null);
    }
    if (!pref) {
      toast.error("Не удалось сохранить предпочтение");
      return;
    }
    const label =
      status === "watchlist" ? "добавлен в список" :
      status === "hidden" ? "скрыт из рекомендаций" :
      status === "liked" ? "отмечен как понравившийся" : "больше не будет рекомендоваться";
    toast.success(`«${it.title}» ${label}`);
    getMediaPreferences("watchlist").then(setWatchlist);
    getMediaTitleStatuses().then(setTitleStatuses);
    refreshDiscover();
  };


  const onTorrent = async (
    hash: string,
    action: "pause" | "resume" | "delete",
  ) => {
    let ok = false;
    try {
      setBusy(hash + action);
      ok = await torrentAction(hash, action);
    } finally {
      setBusy(null);
    }
    if (ok && action === "delete") toast.success("Раздача удалена");
    onMediaUpdate();
  };

  const onScanLibrary = async () => {
    const ok = await refreshJellyfin();
    if (ok) {
      toast.success("Скан Jellyfin запущен");
      onMediaUpdate();
    } else toast.error("Не удалось запустить скан Jellyfin");
  };

  const openDiscover = (it: MediaLookupItem) =>
    nav(
      `/media/${it.kind === "series" ? "series" : "movie"}/${it.id}`,
      { state: returnState() },
    );

  const openTmdb = async (it: TmdbItem) => {
    nav(`/media/${it.kind === "series" ? "series" : "movie"}/${it.tmdbId}`, {
      state: returnState(),
    });
  };

  // ── Not configured ────────────────────────────────────────────────────────
  if (!media.configured) {
    return (
      <div className={ms.page}>
        <div className={ms.pageCols}>
          <div className={ms.pageMain}>
            <Placeholder
              icon="pulse"
              title="Медиа"
              phase="Медиа-стек не настроен (JELLYFIN/QBITTORRENT/JACKETT/TMDB)"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div id="media-page" className={ms.page}>
      <AddTorrentDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={onAdd}
        onAddTitle={onAddTitle}
        onGrabbed={onMediaUpdate}
        onWatchNow={onWatchNow}
        torrserver={media.torrserver}
        downloads={media.downloads}
        busy={busy}
      />
      {player && (
        <Player
          url={player.url}
          title={player.title}
          direct={player.direct}
          onClose={() => setPlayer(null)}
        />
      )}
      {tab === "library" && (
        <MediaLibraryTab
          library={library}
          setLibrary={setLibrary}
          libReady={libReady}
          torrentRail={torrentRail}
          pendingTitles={pendingTitles}
          watchlist={watchlist}
          titleStatuses={titleStatuses}
          mediaHome={mediaHome}
          resume={resume}
          onPlayResume={playResume}
        />
      )}

      {tab === "list" && (
        <MediaLibraryTab
          library={library}
          setLibrary={setLibrary}
          libReady={libReady}
          torrentRail={[]}
          pendingTitles={[]}
          watchlist={watchlist}
          titleStatuses={titleStatuses}
          mediaHome={mediaHome}
          resume={[]}
          onPlayResume={playResume}
          listOnly
        />
      )}

      {tab === "discover" && (
        <MediaDiscoverTab
          library={library}
          tmdb={media.tmdb}
          dq={dq}
          setDq={setDq}
          dres={dres}
          tmRes={tmRes}
          dsearching={dsearching}
          home={discoverHome}
          because={because}
          homeLoading={homeLoading}
          busy={busy}
          onRefresh={refreshDiscover}
          onOpenDiscover={openDiscover}
          onOpenTmdb={openTmdb}
          onAddTmdb={onAddTmdb}
          onPreference={onPreference}
        />
      )}

      {allowSystem && tab === "system" && (
        <MediaSystemTab
          media={media}
          tsStreams={tsStreams}
        magnet={magnet}
          setMagnet={setMagnet}
          busy={busy}
          onWatchNow={onWatchNow}
          onSetPlayer={setPlayer}
        onTorrent={onTorrent}
          onSetAddOpen={setAddOpen}
          onRemoveStream={removeStream}
          onScanLibrary={onScanLibrary}
        />
      )}
    </div>
  );
}
