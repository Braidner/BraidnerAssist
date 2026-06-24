// Страница /media — Jellyfin (что играет + библиотека + встроенный плеер),
// очередь загрузок (Sonarr/Radarr/qBittorrent с управлением) и добавление торрентов
// (прямой magnet + поиск через Prowlarr — в выезжающем дравере у загрузок).

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "../Card.tsx";
import { Placeholder } from "./Placeholder.tsx";
import {
  getMediaLibrary, searchReleases, addTorrent, torrentAction, refreshJellyfin,
  lookupTitle, addTitle, posterUrl, jellyfinPosterUrl, getRecommendations, discoverSearch,
  tmdbSearch, tmdbTrending, tmdbResolveTvdb,
  torrserverAdd, torrserverList, torrserverRemove, torrserverStreamUrl, getCalendar,
  getContinueWatching, getMediaPlayUrl,
  type MediaData, type DownloadItem, type LibraryItem, type SearchResult, type ArrLookupItem,
  type Recommendation, type TorrServerStream, type CalendarItem, type ResumeItem, type TmdbItem,
} from "../../lib/api.ts";
import {
  ReleasePicker, ImportDrawer, ProgressBar, Player, fmtSize, fmtSpeed, fmtEta,
} from "./mediaShared.tsx";
import { FileBrowser } from "./FileBrowser.tsx";
import { useToast } from "../Toast.tsx";

const SOURCE_LABEL: Record<DownloadItem["source"], string> = {
  sonarr: "Sonarr",
  radarr: "Radarr",
  qbittorrent: "qBittorrent",
};

// Относительный день выхода для компактной карточки расписания.
function relDay(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((t - Date.now()) / 86_400_000);
  if (diff <= 0) return "вышло";
  if (diff === 1) return "завтра";
  if (diff <= 21) return `+${diff} дн`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

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
  const [params, setParams] = useSearchParams();
  const tab = ((params.get("tab") as MediaTab) || "library");
  const setTab = (t: MediaTab) => setParams(t === "library" ? {} : { tab: t }, { replace: true });
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
  const [sortBy, setSortBy] = useState<"name" | "year">("name");

  useEffect(() => {
    if (media.configured) getMediaLibrary().then((l) => { setLibrary(l); setLibReady(true); });
  }, [media.configured]);

  // Клиентская фильтрация/сортировка сетки.
  const shownLibrary = library
    .filter((it) => (fType === "all" ? true : it.type === fType))
    .filter((it) => (!onlyUnwatched ? true : !it.played))
    .sort((a, b) =>
      sortBy === "year" ? (b.year ?? 0) - (a.year ?? 0) : a.name.localeCompare(b.name, "ru"),
    );

  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    if (media.configured) getRecommendations().then(setRecs);
  }, [media.configured]);

  // Discovery-поиск: TMDB (если настроен) или *arr lookup. Дебаунс 350мс.
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

  // Тренды TMDB для пустого запроса (подборки).
  useEffect(() => {
    if (media.tmdb) tmdbTrending().then(setTrending);
  }, [media.tmdb]);

  // Переход в карточку из TMDB: фильм — по tmdbId; сериал — резолвим tvdbId.
  const openTmdb = async (it: TmdbItem) => {
    if (it.kind === "movie") { nav(`/media/discover/movie/${it.tmdbId}`); return; }
    setBusy("tmdb" + it.tmdbId);
    const tvdb = await tmdbResolveTvdb(it.tmdbId);
    setBusy(null);
    if (tvdb) nav(`/media/discover/series/${tvdb}`);
    else toast.error("Не удалось определить tvdbId сериала (нет в Sonarr/TVDB)");
  };

  const renderTmdbGrid = (items: TmdbItem[]) => (
    <div className="media-grid">
      {items.map((it) => (
        <button
          key={it.kind + it.tmdbId}
          className="neu media-item"
          title={it.title}
          disabled={busy === "tmdb" + it.tmdbId}
          onClick={() => openTmdb(it)}
        >
          <span className="media-poster-box">
            {it.poster ? (
              <img className="media-item-poster" src={posterUrl(it.poster)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <span className="media-item-poster lk-poster-ph">{it.kind === "movie" ? "🎬" : "📺"}</span>
            )}
          </span>
          <span className="media-item-name">{it.title}</span>
          <span className="media-item-meta mono">
            {it.kind === "movie" ? "🎬 фильм" : "📺 сериал"}{it.year ? ` · ${it.year}` : ""}
          </span>
          <span className="media-item-play">{busy === "tmdb" + it.tmdbId ? "…" : "›"}</span>
        </button>
      ))}
    </div>
  );

  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  useEffect(() => {
    if (media.configured) getCalendar(14).then(setCalendar);
  }, [media.configured]);

  const [resume, setResume] = useState<ResumeItem[]>([]);
  useEffect(() => {
    if (media.configured) getContinueWatching().then(setResume);
  }, [media.configured]);

  const playResume = async (it: ResumeItem) => {
    setBusy("res" + it.id);
    const url = await getMediaPlayUrl(it.id);
    setBusy(null);
    if (url) setPlayer({ url, title: it.title, direct: false });
    else toast.error("Не удалось запустить воспроизведение");
  };

  const refreshTs = () => { if (media.torrserver) torrserverList().then(setTsStreams); };
  useEffect(() => {
    if (media.torrserver) torrserverList().then(setTsStreams);
  }, [media.torrserver]);

  // Запустить мгновенный стрим: добавить в TorrServer и открыть плеер.
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

  const playStream = (s: TorrServerStream) => {
    if (!s.file) { toast.error("Нет видеофайла в раздаче"); return; }
    if (!s.file.playable) toast.info("Формат не для браузера — используй «Ссылка»/«.m3u»");
    setPlayer({ url: torrserverStreamUrl(s.hash, s.file.index), title: s.title, direct: true });
  };

  const removeStream = async (hash: string) => {
    setBusy("tsrm" + hash);
    const ok = await torrserverRemove(hash);
    setBusy(null);
    if (ok) { toast.success("Стрим остановлен"); refreshTs(); }
    else toast.error("Не удалось остановить стрим");
  };

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

  const openDetail = (it: LibraryItem) =>
    nav(`/media/${it.type === "Series" ? "series" : "movie"}/${it.id}`);

  // Клик по результату discovery → детальная карточка по внешнему id (tvdb/tmdb).
  const openDiscover = (it: ArrLookupItem) =>
    nav(`/media/discover/${it.kind === "series" ? "series" : "movie"}/${it.id}`);

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

  return (
    <div className="page">
      <AddTorrentDrawer open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAdd} onAddTitle={onAddTitle} onGrabbed={onMediaUpdate} onWatchNow={onWatchNow} torrserver={media.torrserver} busy={busy} />
      {player && <Player url={player.url} title={player.title} direct={player.direct} onClose={() => setPlayer(null)} />}
      {importFor && (
        <ImportDrawer
          item={importFor}
          onClose={() => setImportFor(null)}
          onDone={() => { setImportFor(null); onMediaUpdate(); refreshJellyfin(); }}
        />
      )}

      <div className="media-tabs">
        <button className={`media-tab-btn ${tab === "library" ? "active" : ""}`} onClick={() => setTab("library")}>Библиотека</button>
        <button className={`media-tab-btn ${tab === "discover" ? "active" : ""}`} onClick={() => setTab("discover")}>Дискавери</button>
        <button className={`media-tab-btn ${tab === "system" ? "active" : ""}`} onClick={() => setTab("system")}>Система</button>
      </div>

      {tab === "library" && (
        <div className="page-col-main">
          {/* Продолжить просмотр (Jellyfin Resume) */}
          {resume.length > 0 && (
            <Card icon="pulse" title="Продолжить просмотр" action={<span className="panel-count">{resume.length}</span>}>
              <div className="resume-row">
                {resume.map((it) => (
                  <button key={it.id} className="neu resume-tile" title={it.title} onClick={() => playResume(it)} disabled={busy === "res" + it.id}>
                    <img className="resume-thumb" src={jellyfinPosterUrl(it.id)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                    <span className="resume-prog"><ProgressBar pct={it.positionPct} /></span>
                    <span className="resume-name">{it.title}</span>
                    <span className="resume-play">{busy === "res" + it.id ? "…" : "▶"}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Библиотека */}
          <Card
            icon="pulse"
            title="Библиотека"
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="panel-count">{shownLibrary.length}</span>
                <button className="btn btn-sm" onClick={() => refreshJellyfin().then(() => getMediaLibrary().then((l) => { setLibrary(l); toast.success("Скан библиотеки запущен"); }))}>
                  Сканировать
                </button>
              </div>
            }
          >
            {library.length > 0 && (
              <div className="lib-filters">
                <div className="seg">
                  <button className={`seg-btn ${fType === "all" ? "on" : ""}`} onClick={() => setFType("all")}>Все</button>
                  <button className={`seg-btn ${fType === "Series" ? "on" : ""}`} onClick={() => setFType("Series")}>Сериалы</button>
                  <button className={`seg-btn ${fType === "Movie" ? "on" : ""}`} onClick={() => setFType("Movie")}>Фильмы</button>
                </div>
                <button className={`btn btn-sm ${onlyUnwatched ? "btn-accent" : ""}`} onClick={() => setOnlyUnwatched((v) => !v)}>
                  Не просмотрено
                </button>
                <button className="btn btn-sm" onClick={() => setSortBy((s) => (s === "name" ? "year" : "name"))}>
                  {sortBy === "name" ? "A→Я" : "↓ год"}
                </button>
              </div>
            )}
            {!libReady ? (
              <div className="media-grid">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="neu-in media-skel" />)}
              </div>
            ) : library.length === 0 ? (
              <div className="empty">Библиотека пуста или ещё не отсканирована.</div>
            ) : shownLibrary.length === 0 ? (
              <div className="empty">Ничего не подходит под фильтр.</div>
            ) : (
              <div className="media-grid">
                {shownLibrary.map((it) => {
                  const isSeries = it.type === "Series";
                  return (
                    <div key={it.id} className="media-item-wrap">
                      <button
                        className="neu media-item"
                        onClick={() => openDetail(it)}
                        title={it.name}
                      >
                        <span className="media-poster-box">
                          <img
                            className="media-item-poster"
                            src={jellyfinPosterUrl(it.id)}
                            alt=""
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                          {it.played ? (
                            <span className="media-badge media-badge-seen" title="Просмотрено">✓</span>
                          ) : isSeries && it.unplayed > 0 ? (
                            <span className="media-badge media-badge-new" title="Непросмотренных эпизодов">{it.unplayed}</span>
                          ) : null}
                        </span>
                        <span className="media-item-name">{it.name}</span>
                        <span className="media-item-meta mono">
                          {isSeries
                            ? `📺${it.childCount ? ` · ${it.childCount} сез.` : ""}`
                            : "фильм"}
                          {it.year ? ` · ${it.year}` : ""}
                        </span>
                        <span className="media-item-play">›</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "discover" && (
        <div className="page-col-main">
          {/* Найти и добавить — поиск по всем тайтлам Sonarr/Radarr; пусто → подборки */}
          <Card
            icon="pulse"
            title="Найти и добавить"
            action={<span className="panel-count">{dq.trim() ? (media.tmdb ? tmRes.length : dres.length) : (media.tmdb ? trending.length : recs.length)}</span>}
          >
            <div className="add-field" style={{ marginTop: 4 }}>
              <input
                className="neu-in mc-input"
                placeholder="Поиск фильмов и сериалов…"
                value={dq}
                onChange={(e) => setDq(e.target.value)}
              />
              {dq && <button className="btn btn-icon btn-sm" title="Очистить" onClick={() => setDq("")}>✕</button>}
            </div>

            {media.tmdb ? (
              dq.trim() ? (
                dsearching && tmRes.length === 0 ? (
                  <div className="media-grid">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="neu-in media-skel" />)}
                  </div>
                ) : tmRes.length === 0 ? (
                  <div className="empty" style={{ marginTop: 10 }}>Ничего не найдено.</div>
                ) : (
                  renderTmdbGrid(tmRes)
                )
              ) : trending.length > 0 ? (
                renderTmdbGrid(trending)
              ) : (
                <div className="empty" style={{ marginTop: 10 }}>Введи название, чтобы найти фильм или сериал.</div>
              )
            ) : dq.trim() ? (
              dsearching && dres.length === 0 ? (
                <div className="media-grid">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="neu-in media-skel" />)}
                </div>
              ) : dres.length === 0 ? (
                <div className="empty" style={{ marginTop: 10 }}>Ничего не найдено.</div>
              ) : (
                <div className="media-grid">
                  {dres.map((it) => (
                    <button
                      key={it.kind + it.id}
                      className="neu media-item"
                      title={it.title}
                      onClick={() => openDiscover(it)}
                    >
                      <span className="media-poster-box">
                        {it.poster ? (
                          <img
                            className="media-item-poster"
                            src={posterUrl(it.poster)}
                            alt=""
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="media-item-poster lk-poster-ph">{it.kind === "movie" ? "🎬" : "📺"}</span>
                        )}
                        {it.added && <span className="media-badge media-badge-seen" title="Уже в библиотеке">✓</span>}
                      </span>
                      <span className="media-item-name">{it.title}</span>
                      <span className="media-item-meta mono">
                        {it.kind === "movie" ? "🎬 фильм" : "📺 сериал"}{it.year ? ` · ${it.year}` : ""}
                      </span>
                      <span className="media-item-play">›</span>
                    </button>
                  ))}
                </div>
              )
            ) : recs.length > 0 ? (
              <div className="media-grid">
                {recs.map((r) => {
                  const key = "rec" + r.kind + r.id;
                  return (
                    <div key={key} className="neu media-item">
                      {r.poster ? (
                        <img
                          className="media-item-poster"
                          src={posterUrl(r.poster)}
                          alt=""
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <span className="media-item-poster lk-poster-ph">{r.kind === "movie" ? "🎬" : "📺"}</span>
                      )}
                      <span className="media-item-name">{r.title}</span>
                      <span className="media-item-meta mono">
                        {r.kind === "movie" ? "фильм" : "сериал"}{r.year ? ` · ${r.year}` : ""}
                      </span>
                      <button
                        className="btn btn-sm btn-accent media-item-add"
                        disabled={busy === key}
                        onClick={() => onAddRec(r)}
                      >
                        {busy === key ? "…" : "+ Добавить"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty" style={{ marginTop: 10 }}>Введи название фильма или сериала, чтобы найти и открыть карточку.</div>
            )}
          </Card>

          {/* Скоро выйдет — ближайшие эпизоды/релизы (полное — на /media/calendar) */}
          {calendar.length > 0 && (
            <Card
              icon="chart"
              title="Скоро выйдет"
              action={<button className="btn btn-sm" onClick={() => nav("/media/calendar")}>Всё расписание</button>}
            >
              <div className="cal-rows">
                {calendar.slice(0, 6).map((it, i) => (
                  <div key={i} className={`cal-row ${it.hasFile ? "cal-has" : ""}`}>
                    <span className="cal-kind">{it.kind === "series" ? "📺" : "🎬"}</span>
                    <span className="cal-title" title={it.title}>
                      {it.title}
                      {it.kind === "series" && it.seasonNumber != null && (
                        <span className="cal-ep mono"> S{it.seasonNumber}{it.episodeNumber != null ? `E${it.episodeNumber}` : ""}</span>
                      )}
                    </span>
                    <span className="cal-when mono">{relDay(it.airDate)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "system" && (
        <div className="page-col-main">
          {/* Смотреть онлайн через TorrServer — мгновенный стрим без полной загрузки */}
          {media.torrserver && (
            <Card icon="pulse" title="Смотреть онлайн" action={<span className="panel-count">{tsStreams.length}</span>}>
              <div className="add-field" style={{ marginTop: 4 }}>
                <input
                  className="neu-in mc-input"
                  placeholder="magnet:… для мгновенного просмотра"
                  value={magnet}
                  onChange={(e) => setMagnet(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && magnet.trim()) { onWatchNow(magnet.trim(), "Поток", "ts-magnet").then(() => setMagnet("")); } }}
                />
                <button
                  className="btn btn-icon btn-accent"
                  disabled={!magnet.trim() || busy === "ts-magnet"}
                  title="Смотреть сейчас"
                  onClick={() => onWatchNow(magnet.trim(), "Поток", "ts-magnet").then(() => setMagnet(""))}
                >
                  {busy === "ts-magnet" ? "…" : "▶"}
                </button>
              </div>
              {tsStreams.length === 0 ? (
                <div className="empty" style={{ marginTop: 10 }}>Нет активных потоков. Вставь magnet или жми «▶ Сейчас» в поиске.</div>
              ) : (
                <div className="ts-list">
                  {tsStreams.map((s) => (
                    <div key={s.hash} className="ts-row">
                      <span className="ts-title" title={s.file?.path ?? s.title}>{s.title}</span>
                      <div className="ts-actions">
                        <button className="btn btn-icon btn-sm" title="Смотреть" disabled={!s.file} onClick={() => playStream(s)}>▶</button>
                        <button className="btn btn-icon btn-sm" title="Остановить стрим" disabled={busy === "tsrm" + s.hash} onClick={() => removeStream(s.hash)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Очередь загрузок + кнопка открытия дравера «Добавить» */}
          <Card
            icon="cloud"
            title="Загрузки"
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="panel-count">{media.downloads.length}</span>
                <button className="btn btn-sm btn-accent" onClick={() => setAddOpen(true)}>
                  + Добавить
                </button>
              </div>
            }
          >
            {media.downloads.length === 0 ? (
              <div className="empty">Очередь пуста. Нажми «Добавить», чтобы найти и скачать.</div>
            ) : (
              <div className="dl-list">
                {(() => {
                  const totalSpeed = media.downloads.reduce((s, d) => s + (d.dlspeed ?? 0), 0);
                  const pending = media.downloads.filter((d) => d.importPending).length;
                  if (totalSpeed <= 0 && pending === 0) return null;
                  return (
                    <div className="dl-summary mono">
                      {totalSpeed > 0 && <span>↓ {fmtSpeed(totalSpeed)}</span>}
                      {pending > 0 && <span className="dl-summary-warn">⚠ не импортировано: {pending}</span>}
                    </div>
                  );
                })()}
                {media.downloads.map((d) => {
                  const isQb = d.source === "qbittorrent";
                  // qBittorrent 5.x: pausedDL/UP → stoppedDL/UP.
                  const paused = /paused|stopped/i.test(d.state);
                  const meta = [
                    isQb && !paused ? fmtSpeed(d.dlspeed) : "",
                    fmtEta(d.eta),
                    d.seeds != null ? `${d.seeds} seed` : "",
                    fmtSize(d.size),
                    paused ? "на паузе" : "",
                  ].filter(Boolean).join(" · ");
                  return (
                    <div key={d.hash} className="dl-row">
                      <div className="dl-head">
                        <span className="dl-title" title={d.title}>{d.title}</span>
                        {d.importPending && (
                          <span className="dl-import-badge" title={d.importMessage}>⚠ не импортировано</span>
                        )}
                        <span className="dl-source">{SOURCE_LABEL[d.source]}</span>
                      </div>
                      <div className="dl-progress">
                        <ProgressBar pct={d.progress} />
                        <span className="dl-pct">{d.progress}%</span>
                      </div>
                      <div className="dl-foot">
                        <span className="dl-meta">{meta || "—"}</span>
                        <div className="dl-actions">
                          {!isQb && d.importPending && (
                            <button className="btn btn-sm btn-accent" title="Ручной импорт файлов" onClick={() => setImportFor(d)}>Импорт</button>
                          )}
                          {isQb && (
                            <>
                              {paused ? (
                                <button className="btn btn-icon btn-sm" title="Возобновить" disabled={busy === d.hash + "resume"} onClick={() => onTorrent(d.hash, "resume")}>▶</button>
                              ) : (
                                <button className="btn btn-icon btn-sm" title="Пауза" disabled={busy === d.hash + "pause"} onClick={() => onTorrent(d.hash, "pause")}>⏸</button>
                              )}
                              <button className="btn btn-icon btn-sm" title="Удалить" disabled={busy === d.hash + "delete"} onClick={() => onTorrent(d.hash, "delete")}>🗑</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Файловый менеджер медиатеки (Media v2 — если задан MEDIA_ROOT) */}
          <FileBrowser />
        </div>
      )}
    </div>
  );
}
