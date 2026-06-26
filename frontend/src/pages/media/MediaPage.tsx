// Страница /media — shell: state, polling, tab routing.
// Tab components: MediaLibraryTab, MediaDiscoverTab, MediaSystemTab.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRegisterTabs } from "../../lib/tabsContext.tsx";
import { Placeholder } from "../../components/panels/Placeholder.tsx";
import {
  getMediaLibrary, addTorrent, torrentAction, refreshJellyfin,
  lookupTitle, addTitle, searchReleases, posterUrl,
  getRecommendations, discoverSearch,
  tmdbSearch, tmdbTrending, tmdbResolveTvdb,
  torrserverAdd, torrserverList, torrserverRemove, torrserverStreamUrl, getCalendar,
  getContinueWatching, getMediaPlayUrl,
  type MediaData, type DownloadItem, type LibraryItem, type SearchResult, type ArrLookupItem,
  type Recommendation, type TorrServerStream, type CalendarItem, type ResumeItem, type TmdbItem,
} from "../../lib/api.ts";
import {
  ReleasePicker, ImportDrawer, Player, fmtSize,
} from "./shared/mediaShared.tsx";
import { useToast } from "../../components/ui/Toast.tsx";
import { MediaLibraryTab } from "./MediaLibraryTab.tsx";
import { MediaDiscoverTab } from "./MediaDiscoverTab.tsx";
import { MediaSystemTab } from "./MediaSystemTab.tsx";

// Дравер «Добавить»: основной путь — поиск тайтла в Radarr/Sonarr (правильный
// пайплайн в медиатеку); ниже — ручные опции (прямой magnet + raw-поиск Prowlarr).
function AddTorrentDrawer({
  open, onClose, onAdd, onAddTitle, onGrabbed, onWatchNow, torrserver, busy,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (url: string, key: string) => Promise<void>;
  onAddTitle: (item: ArrLookupItem, key: string) => Promise<boolean>;
  onGrabbed: () => void;
  onWatchNow: (url: string, title: string, key: string) => Promise<void>;
  torrserver: boolean;
  busy: string | null;
}) {
  const [kind, setKind] = useState<"movie" | "series">("movie");
  const [titleQuery, setTitleQuery] = useState("");
  const [titleResults, setTitleResults] = useState<ArrLookupItem[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [addedIds, setAddedIds] = useState<Record<number, boolean>>({});
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickSeason, setPickSeason] = useState(1);

  const [showManual, setShowManual] = useState(false);
  const [magnet, setMagnet] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onLookup = async () => {
    const q = titleQuery.trim();
    if (!q) return;
    setLookingUp(true);
    setTitleResults(await lookupTitle(kind, q));
    setLookingUp(false);
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults(await searchReleases(q));
    setSearching(false);
  };

  return (
    <>
      <div className={`drawer-overlay ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`drawer ${open ? "open" : ""}`}>
        <div className="drawer-inner">
          <div className="drawer-head">
            <span className="drawer-kind">Добавить в медиатеку</span>
            <button className="btn btn-icon btn-sm" onClick={onClose}>✕</button>
          </div>

          {/* Основной путь: Radarr/Sonarr — авто-граб + импорт + скан */}
          <div className="seg">
            <button className={`seg-btn ${kind === "movie" ? "on" : ""}`} onClick={() => { setKind("movie"); setTitleResults([]); }}>Фильм</button>
            <button className={`seg-btn ${kind === "series" ? "on" : ""}`} onClick={() => { setKind("series"); setTitleResults([]); }}>Сериал</button>
          </div>
          <div className="add-field">
            <input
              className="neu-in mc-input"
              placeholder={kind === "movie" ? "Название фильма…" : "Название сериала…"}
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onLookup(); }}
            />
            <button className="btn btn-icon btn-accent" disabled={!titleQuery.trim() || lookingUp} onClick={onLookup}>
              {lookingUp ? "…" : "🔍"}
            </button>
          </div>

          {titleResults.length > 0 && (
            <div className="lk-list">
              {titleResults.map((it) => {
                const isAdded = it.added || addedIds[it.id];
                const key = `title-${it.id}`;
                const pickerOn = pickerFor === it.id;
                return (
                  <div key={it.id} className="lk-wrap">
                    <div className="lk-row">
                      <div className="lk-poster">
                        {it.poster ? <img src={posterUrl(it.poster)} alt="" loading="lazy" /> : <span className="lk-poster-ph">{kind === "movie" ? "🎬" : "📺"}</span>}
                      </div>
                      <div className="lk-body">
                        <span className="lk-title" title={it.title}>{it.title}{it.year ? ` (${it.year})` : ""}</span>
                        {it.overview && <span className="lk-overview">{it.overview}</span>}
                        <div className="lk-actions">
                          <button
                            className="btn btn-sm btn-accent"
                            disabled={isAdded || busy === key}
                            onClick={async () => { const ok = await onAddTitle(it, key); if (ok) setAddedIds((p) => ({ ...p, [it.id]: true })); }}
                          >
                            {isAdded ? "В библиотеке" : busy === key ? "…" : "Добавить"}
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => setPickerFor(pickerOn ? null : it.id)}
                          >
                            {pickerOn ? "Скрыть раздачи" : "Выбрать раздачу"}
                          </button>
                        </div>
                      </div>
                    </div>
                    {pickerOn && (
                      <div className="lk-picker">
                        {it.kind === "series" && (
                          <div className="add-field" style={{ alignItems: "center" }}>
                            <span className="add-label" style={{ margin: 0 }}>Сезон</span>
                            <input
                              className="neu-in mc-input"
                              type="number"
                              min={1}
                              value={pickSeason}
                              onChange={(e) => setPickSeason(Math.max(0, Number(e.target.value) || 1))}
                              style={{ width: 70 }}
                            />
                          </div>
                        )}
                        <ReleasePicker
                          params={it.kind === "series"
                            ? { type: "series", id: it.id, seasonNumber: pickSeason }
                            : { type: "movie", id: it.id }}
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
            <div className="empty" style={{ marginTop: 12 }}>Ничего не найдено.</div>
          )}

          {/* Ручные опции — прямой magnet и сырой поиск Prowlarr */}
          <button className="add-toggle" onClick={() => setShowManual((v) => !v)}>
            {showManual ? "▾" : "▸"} Вручную (magnet / Prowlarr)
          </button>

          {showManual && (
            <>
              <div className="add-label">Прямая ссылка (magnet или .torrent)</div>
              <div className="add-field">
                <input
                  className="neu-in mc-input"
                  placeholder="magnet:… или https://….torrent"
                  value={magnet}
                  onChange={(e) => setMagnet(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && magnet.trim()) onAdd(magnet.trim(), "magnet").then(() => setMagnet("")); }}
                />
                <button className="btn btn-icon btn-accent" disabled={!magnet.trim() || busy === "magnet"} onClick={() => onAdd(magnet.trim(), "magnet").then(() => setMagnet(""))}>
                  {busy === "magnet" ? "…" : "+"}
                </button>
              </div>

              <div className="add-label">Поиск релизов (Prowlarr)</div>
              <div className="add-field">
                <input
                  className="neu-in mc-input"
                  placeholder="Название релиза…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
                />
                <button className="btn btn-icon btn-accent" disabled={!query.trim() || searching} onClick={onSearch}>
                  {searching ? "…" : "🔍"}
                </button>
              </div>

              {results.length > 0 && (
                <div className="sr-list">
                  {results.map((r) => (
                    <div key={r.guid} className="sr-row">
                      <span className="sr-title" title={r.title}>{r.title}</span>
                      <div className="sr-foot">
                        <span className="sr-meta">
                          {fmtSize(r.size)} · <span className="sr-seeds">{r.seeders} seed</span> · {r.indexer}
                        </span>
                        <div className="sr-btns">
                          {torrserver && (
                            <button
                              className="btn btn-sm"
                              disabled={!r.url || busy === r.guid + "ts"}
                              title="Смотреть сейчас через TorrServer (без полной загрузки)"
                              onClick={() => r.url && onWatchNow(r.url, r.title, r.guid + "ts")}
                            >
                              {busy === r.guid + "ts" ? "…" : "▶ Сейчас"}
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-accent"
                            disabled={!r.url || busy === r.guid}
                            onClick={() => r.url && onAdd(r.url, r.guid)}
                          >
                            {busy === r.guid ? "…" : "Скачать"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!searching && query.trim() && results.length === 0 && (
                <div className="empty" style={{ marginTop: 14 }}>Ничего не найдено.</div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

type MediaTab = "library" | "discover" | "system";

export function MediaPage({ media, onMediaUpdate }: { media: MediaData; onMediaUpdate: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const tab = ((params.get("tab") as MediaTab) || "library");

  const TAB_KEYS: MediaTab[] = ["library", "discover", "system"];
  useRegisterTabs(
    ['Библиотека', 'Дискавери', 'Система'],
    Math.max(0, TAB_KEYS.indexOf(tab)),
    (i: number) => nav(`/media${i > 0 ? `?tab=${TAB_KEYS[i]}` : ''}`),
  );

  // ── Shared state ──────────────────────────────────────────────────────────
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [importFor, setImportFor] = useState<DownloadItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [player, setPlayer] = useState<{ url: string; title: string; direct: boolean } | null>(null);
  const [tsStreams, setTsStreams] = useState<TorrServerStream[]>([]);
  const [magnet, setMagnet] = useState("");
  const [libReady, setLibReady] = useState(false);
  const [fType, setFType] = useState<"all" | "Series" | "Movie">("all");
  const [onlyUnwatched, setOnlyUnwatched] = useState(false);
  const [sortBy, _setSortBy] = useState<"name" | "year">("name");

  // Library data
  useEffect(() => {
    if (media.configured) getMediaLibrary().then((l) => { setLibrary(l); setLibReady(true); });
  }, [media.configured]);

  const shownLibrary = library
    .filter((it) => (fType === "all" ? true : it.type === fType))
    .filter((it) => (!onlyUnwatched ? true : !it.played))
    .sort((a, b) =>
      sortBy === "year" ? (b.year ?? 0) - (a.year ?? 0) : a.name.localeCompare(b.name, "ru"),
    );

  // Recommendations
  const [recs, setRecs] = useState<Recommendation[]>([]);
  useEffect(() => {
    if (media.configured) getRecommendations().then(setRecs);
  }, [media.configured]);

  // Discovery search state (TMDB or *arr)
  const [dq, setDq] = useState("");
  const [dres, setDres] = useState<ArrLookupItem[]>([]);
  const [tmRes, setTmRes] = useState<TmdbItem[]>([]);
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [dsearching, setDsearching] = useState(false);
  useEffect(() => {
    const q = dq.trim();
    if (q.length < 2) { setDres([]); setTmRes([]); setDsearching(false); return; }
    setDsearching(true);
    const t = setTimeout(() => {
      if (media.tmdb) tmdbSearch(q).then((r) => { setTmRes(r); setDsearching(false); });
      else discoverSearch(q).then((r) => { setDres(r); setDsearching(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [dq, media.tmdb]);

  useEffect(() => {
    if (media.tmdb) tmdbTrending().then(setTrending);
  }, [media.tmdb]);

  // Calendar
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  useEffect(() => {
    if (media.configured) getCalendar(14).then(setCalendar);
  }, [media.configured]);

  // Continue watching
  const [resume, setResume] = useState<ResumeItem[]>([]);
  useEffect(() => {
    if (media.configured) getContinueWatching().then(setResume);
  }, [media.configured]);

  // TorrServer streams
  const refreshTs = () => { if (media.torrserver) torrserverList().then(setTsStreams); };
  useEffect(() => {
    if (media.torrserver) torrserverList().then(setTsStreams);
  }, [media.torrserver]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const playResume = async (it: ResumeItem) => {
    setBusy("res" + it.id);
    const url = await getMediaPlayUrl(it.id);
    setBusy(null);
    if (url) setPlayer({ url, title: it.title, direct: false });
    else toast.error("Не удалось запустить воспроизведение");
  };

  const onWatchNow = async (url: string, title: string, key: string) => {
    if (!media.torrserver) return;
    setBusy(key);
    const info = await torrserverAdd(url, title);
    setBusy(null);
    if (!info || !info.file) {
      toast.error("TorrServer: не удалось получить видеофайл");
      return;
    }
    refreshTs();
    if (!info.file.playable) toast.info("Формат не для браузера — используй «Ссылка»/«.m3u» во внешнем плеере");
    setPlayer({ url: torrserverStreamUrl(info.hash, info.file.index), title: info.title || title, direct: true });
  };

  const removeStream = async (hash: string) => {
    setBusy("tsrm" + hash);
    const ok = await torrserverRemove(hash);
    setBusy(null);
    if (ok) { toast.success("Стрим остановлен"); refreshTs(); }
    else toast.error("Не удалось остановить стрим");
  };

  const onAdd = async (url: string, key: string) => {
    setBusy(key);
    const ok = await addTorrent(url);
    setBusy(null);
    if (ok) { toast.success("Торрент добавлен в qBittorrent"); onMediaUpdate(); }
    else toast.error("Не удалось добавить торрент");
  };

  const onAddTitle = async (item: ArrLookupItem, key: string): Promise<boolean> => {
    setBusy(key);
    const ok = await addTitle(item.kind, item.id);
    setBusy(null);
    if (ok) { toast.success(`«${item.title}» добавлен — ищем релиз`); onMediaUpdate(); }
    else toast.error("Не удалось добавить тайтл");
    return ok;
  };

  const onAddRec = async (rec: Recommendation) => {
    const key = "rec" + rec.kind + rec.id;
    setBusy(key);
    const okAdd = await addTitle(rec.kind, rec.id);
    setBusy(null);
    if (okAdd) {
      toast.success(`«${rec.title}» добавлен в библиотеку`);
      setRecs((prev) => prev.filter((r) => !(r.kind === rec.kind && r.id === rec.id)));
      onMediaUpdate();
    } else toast.error("Не удалось добавить");
  };

  const onTorrent = async (hash: string, action: "pause" | "resume" | "delete") => {
    setBusy(hash + action);
    const ok = await torrentAction(hash, action);
    setBusy(null);
    if (ok && action === "delete") toast.success("Раздача удалена");
    onMediaUpdate();
  };

  const openDiscover = (it: ArrLookupItem) =>
    nav(`/media/discover/${it.kind === "series" ? "series" : "movie"}/${it.id}`);

  const openTmdb = async (it: TmdbItem) => {
    if (it.kind === "movie") { nav(`/media/discover/movie/${it.tmdbId}`); return; }
    setBusy("tmdb" + it.tmdbId);
    const tvdb = await tmdbResolveTvdb(it.tmdbId);
    setBusy(null);
    if (tvdb) nav(`/media/discover/series/${tvdb}`);
    else toast.error("Не удалось определить tvdbId сериала (нет в Sonarr/TVDB)");
  };

  // ── Not configured ────────────────────────────────────────────────────────
  if (!media.configured) {
    return (
      <div className="page">
        <div className="page-cols">
          <div className="page-col-main">
            <Placeholder icon="pulse" title="Медиа" phase="Медиа-стек не настроен (JELLYFIN/SONARR/RADARR/QBITTORRENT/PROWLARR)" />
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <AddTorrentDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={onAdd}
        onAddTitle={onAddTitle}
        onGrabbed={onMediaUpdate}
        onWatchNow={onWatchNow}
        torrserver={media.torrserver}
        busy={busy}
      />
      {player && <Player url={player.url} title={player.title} direct={player.direct} onClose={() => setPlayer(null)} />}
      {importFor && (
        <ImportDrawer
          item={importFor}
          onClose={() => setImportFor(null)}
          onDone={() => { setImportFor(null); onMediaUpdate(); refreshJellyfin(); }}
        />
      )}

      {tab === "library" && (
        <MediaLibraryTab
          library={library}
          setLibrary={setLibrary}
          libReady={libReady}
          resume={resume}
          fType={fType}
          setFType={setFType}
          onlyUnwatched={onlyUnwatched}
          setOnlyUnwatched={setOnlyUnwatched}
          sortBy={sortBy}
          shownLibrary={shownLibrary}
          onPlayResume={playResume}
          busy={busy}
        />
      )}

      {tab === "discover" && (
        <MediaDiscoverTab
          tmdb={media.tmdb}
          dq={dq}
          setDq={setDq}
          dres={dres}
          tmRes={tmRes}
          trending={trending}
          dsearching={dsearching}
          recs={recs}
          calendar={calendar}
          busy={busy}
          onAddRec={onAddRec}
          onOpenDiscover={openDiscover}
          onOpenTmdb={openTmdb}
        />
      )}

      {tab === "system" && (
        <MediaSystemTab
          media={media}
          tsStreams={tsStreams}
          magnet={magnet}
          setMagnet={setMagnet}
          busy={busy}
          onWatchNow={onWatchNow}
          onSetPlayer={setPlayer}
          onSetImportFor={setImportFor}
          onTorrent={onTorrent}
          onSetAddOpen={setAddOpen}
          onRemoveStream={removeStream}
        />
      )}
    </div>
  );
}
