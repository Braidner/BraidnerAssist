// Детальная страница сериала (/media/series/:id) — Sonarr-style: шапка с
// метаданными и monitor/поиском, полный список сезонов/эпизодов (скачано/нет,
// качество, дата, превью), прогресс по сезону, встроенный плеер, поиск раздач
// на сезон, bulk-поиск недостающих и ручной импорт застрявшей раздачи.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Player, ReleasePicker, ImportDrawer, ProgressBar, fmtSize } from "./mediaShared.tsx";
import { TorrentFilePicker, ContentTorrents } from "./mediaPick.tsx";
import {
  getSeriesPageDetail, getSeriesDiscoverDetail, addTitle,
  getMediaPlayUrl, jellyfinPosterUrl, jellyfinBackdropUrl, posterUrl, seasonSearch, setMonitored,
  getMediaLibrary,
  type SeriesPageDetail, type DownloadItem, type MediaData, type LibraryItem,
} from "../../lib/api.ts";
import { useToast } from "../Toast.tsx";

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
const fmtAir = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "");

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
const isAired = (iso: string | null) => Boolean(iso && new Date(iso).getTime() < Date.now());

const ACCENT_COLORS = ['#cc3300', '#0077dd', '#00aaee', '#8833ff', '#ffaa00', '#00b8ae'];
const titleAccent = (title: string) => ACCENT_COLORS[title.charCodeAt(0) % ACCENT_COLORS.length];

export function MediaSeriesPage({ media, onMediaUpdate, source = "library" }: { media: MediaData; onMediaUpdate: () => void; source?: "library" | "discover" }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<SeriesPageDetail | null | "loading">("loading");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [act, setAct] = useState<string | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [pickerSeason, setPickerSeason] = useState<number | null>(null);
  const [showAllPicker, setShowAllPicker] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [pickReload, setPickReload] = useState(0);
  const [importItem, setImportItem] = useState<DownloadItem | null>(null);

  // discover-карточка резолвится по tvdbId (id = tvdbId), library — по Jellyfin-id.
  const fetchDetail = () => (source === "discover" ? getSeriesDiscoverDetail(Number(id)) : getSeriesPageDetail(id));

  useEffect(() => {
    setD("loading");
    fetchDetail().then((r) => setD(r));
    getMediaLibrary().then(setLibrary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source]);

  const play = async (jellyfinId: string, title: string) => {
    setBusy(jellyfinId);
    const url = await getMediaPlayUrl(jellyfinId);
    setBusy(null);
    if (url) setPlayer({ url, title });
  };

  if (d === "loading") return <div className="page"><div className="empty" style={{ marginTop: 40 }}>Загружаем…</div></div>;
  if (!d) return <div className="page"><div className="empty" style={{ marginTop: 40 }}>Не удалось загрузить сериал.</div></div>;

  const det = d;
  const tvdbId = det.tvdbId;

  const accent = titleAccent(det.title);
  const accentGradient = `radial-gradient(ellipse at 60% 40%, ${accent}88 0%, ${accent}22 50%, #050508 100%)`;

  const patchSeasonMon = (sn: number, val: boolean) =>
    setD((p) => (p && p !== "loading" ? { ...p, seasons: p.seasons.map((s) => (s.seasonNumber === sn ? { ...s, monitored: val } : s)) } : p));
  const patchSeriesMon = (val: boolean) =>
    setD((p) => (p && p !== "loading" ? { ...p, monitored: val } : p));

  const toggleMonitor = async (val: boolean, sn?: number) => {
    if (tvdbId == null) return;
    setAct(sn == null ? "mon" : "mon" + sn);
    const ok = await setMonitored("series", tvdbId, val, sn);
    setAct(null);
    if (ok) {
      sn == null ? patchSeriesMon(val) : patchSeasonMon(sn, val);
      toast.success(val ? "Мониторинг включён" : "Мониторинг выключен");
    } else toast.error("Не удалось изменить мониторинг");
  };

  const findSeason = async (sn?: number) => {
    if (tvdbId == null) return;
    setAct(sn == null ? "find" : "find" + sn);
    const ok = await seasonSearch("series", tvdbId, sn);
    setAct(null);
    if (ok) toast.success(sn == null ? "Поиск недостающих серий запущен" : `Поиск сезона ${sn} запущен`);
    else toast.error("Не удалось запустить поиск");
  };

  const addToLib = async () => {
    if (tvdbId == null) return;
    setAct("add");
    const ok = await addTitle("series", tvdbId);
    setAct(null);
    if (ok) { toast.success(`«${det.title}» добавлен в библиотеку — ищем релиз`); onMediaUpdate(); fetchDetail().then(setD); }
    else toast.error("Не удалось добавить в библиотеку");
  };

  // Один и тот же пак приходит несколькими queue-записями → дедуп по downloadId.
  const stuck = [
    ...new Map(
      media.downloads
        .filter((x) => x.importPending && x.source === "sonarr" && norm(x.title).includes(norm(det.title)))
        .map((x) => [x.downloadId ?? x.hash, x]),
    ).values(),
  ];

  // Похожие — из библиотеки по жанрам
  const similarItems = library
    .filter((x) => x.id !== id && x.type === "Series")
    .slice(0, 8);

  const posterSrc = det.posterRemote ? posterUrl(det.posterRemote) : jellyfinPosterUrl(det.jellyfinId);

  return (
    <div className="page">
      {player && <Player url={player.url} title={player.title} onClose={() => setPlayer(null)} />}
      {importItem && (
        <ImportDrawer
          item={importItem}
          onClose={() => setImportItem(null)}
          onDone={() => { setImportItem(null); onMediaUpdate(); fetchDetail().then(setD); }}
        />
      )}

      {/* det-topbar */}
      <div className="det-topbar">
        <button className="det-back" onClick={() => nav('/media')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>НАЗАД</span>
        </button>
        <span className="det-topbar-title lmono">{det.title}</span>
        <button className="det-queue-btn" onClick={() => setShowAllPicker((v) => !v)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 3h14a1 1 0 011 1v17l-8-4-8 4V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
          В очередь
        </button>
      </div>

      {/* det-hero */}
      <div className="det-hero">
        <div className="det-hero-bg" style={{ background: accentGradient }}>
          <img
            src={jellyfinBackdropUrl(det.jellyfinId)}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="det-hero-glow" style={{ background: `radial-gradient(ellipse at 55% 40%, ${accent}50 0%, transparent 65%)` }} />
        <div className="det-hero-noise" />
        <div className="det-hero-vignette" />
        <div className="det-hero-content">
          <div className="det-hero-info">
            <div className="det-eyebrow lmono">СЕРИАЛ</div>
            <h1 className="det-title">{det.title}</h1>
            <div className="det-meta lmono">
              {det.year && <span>{det.year}</span>}
              {det.runtime && <><span className="det-sep">·</span><span>{det.runtime} мин / эп.</span></>}
              {det.rating && <><span className="det-sep">·</span><span>★ {det.rating.toFixed(1)}</span></>}
            </div>
            {det.genres?.length > 0 && (
              <div className="det-genres">
                {det.genres.slice(0, 4).map(g => <span key={g} className="det-genre-chip">{g}</span>)}
              </div>
            )}
          </div>
          <div className="det-poster-wrap">
            <div className="det-poster-art">
              <div style={{ position: 'absolute', inset: 0, background: accentGradient }} />
              <img
                src={posterSrc}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* det-body */}
      <div className="det-body">
        {det.overview && <p className="det-desc">{det.overview}</p>}

        {/* Status badges */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {det.status && <span className="rel-badge">{det.status}</span>}
          {!det.inArr && <span className="rel-reject" title="Нет в Sonarr — данные из Jellyfin">только Jellyfin</span>}
          {det.network && <span className="rel-lang">{det.network}</span>}
        </div>

        {/* Actions */}
        <div className="det-actions">
          {!det.inArr && tvdbId != null && (
            <button className="det-btn-play" style={{ '--bc': accent } as React.CSSProperties}
              disabled={act === "add"} onClick={addToLib}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 21,12 6,21"/></svg>
              {act === "add" ? "…" : "В библиотеку"}
            </button>
          )}
          {det.inArr && tvdbId != null && (
            <>
              <button
                className={`btn btn-sm ${det.monitored ? "btn-accent" : ""}`}
                disabled={act === "mon"}
                title={det.monitored ? "Снять весь сериал с мониторинга" : "Мониторить весь сериал"}
                onClick={() => toggleMonitor(!det.monitored)}
              >
                {act === "mon" ? "…" : det.monitored ? "★ Мониторится" : "☆ Мониторить"}
              </button>
              <button className="btn btn-sm" disabled={act === "find"} title="Найти все недостающие серии" onClick={() => findSeason()}>
                {act === "find" ? "…" : "⬇ Найти недостающие"}
              </button>
            </>
          )}
          {tvdbId != null && (
            <button className="btn btn-sm" title="Поиск всех раздач сериала (включая мультисезонные паки)" onClick={() => setShowAllPicker((v) => !v)}>
              {showAllPicker ? "Скрыть раздачи" : "🔍 Все раздачи"}
            </button>
          )}
          {stuck.map((s) => (
            <button key={s.downloadId ?? s.hash} className="btn btn-sm mediadetail-import" title={s.importMessage} onClick={() => setImportItem(s)}>
              ⚠ Импорт застрявшей раздачи
            </button>
          ))}
        </div>

        {/* Качается из торрента (Media v2) — прогресс по сериям + докачать ещё */}
        <ContentTorrents contentType="series" tvdbId={tvdbId} reloadKey={pickReload} />

        {/* Пофайловый выбор серий из торрента (Media v2) */}
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-sm" onClick={() => setShowPick((v) => !v)} style={{ marginBottom: 8 }}>
            {showPick ? "Скрыть серии из торрента" : "🔍 Скачать по сериям (торрент)"}
          </button>
          {showPick && (
            <TorrentFilePicker contentType="series" tvdbId={tvdbId} title={det.title} onGrabbed={() => setPickReload((n) => n + 1)} />
          )}
        </div>

        {showAllPicker && tvdbId != null && (
          <div style={{ marginTop: 16 }}>
            <div className="det-sec-label">ВСЕ РАЗДАЧИ</div>
            <div className="det-desc" style={{ marginBottom: 8 }}>
              Включая мультисезонные паки. После загрузки пака разложи серии кнопкой «Импорт» в Загрузках.
            </div>
            <ReleasePicker params={{ type: "series", id: tvdbId }} onGrabbed={onMediaUpdate} />
          </div>
        )}

        {/* Seasons accordion */}
        {det.seasons.length === 0 ? (
          <div className="empty" style={{ marginTop: 24 }}>Эпизоды не найдены.</div>
        ) : (
          <div className="det-seasons-block" style={{ marginTop: 24 }}>
            <div className="det-sec-label">СЕЗОНЫ</div>
            {det.seasons.map((s) => {
              const isOpen = openSeason === s.seasonNumber;
              const pickerOn = pickerSeason === s.seasonNumber;
              const label = s.seasonNumber === 0 ? "Спецвыпуски" : `Сезон ${s.seasonNumber}`;
              const pct = s.totalCount > 0 ? Math.round((s.fileCount / s.totalCount) * 100) : 0;
              return (
                <div key={s.seasonNumber} className="det-season">
                  <button className="det-season-head" onClick={() => setOpenSeason(isOpen ? null : s.seasonNumber)}>
                    <span>{label}</span>
                    <span className="det-season-count lmono">
                      <ProgressBar pct={pct} />
                      <span style={{ marginLeft: 6 }}>{s.fileCount}/{s.totalCount} эп.</span>
                    </span>
                    {/* Season action buttons */}
                    {det.inArr && tvdbId != null && (
                      <>
                        <button
                          className={`btn btn-icon btn-sm ${s.monitored ? "btn-accent" : ""}`}
                          disabled={act === "mon" + s.seasonNumber}
                          title={s.monitored ? "Снять сезон с мониторинга" : "Мониторить сезон"}
                          onClick={(e) => { e.stopPropagation(); toggleMonitor(!s.monitored, s.seasonNumber); }}
                        >
                          {act === "mon" + s.seasonNumber ? "…" : s.monitored ? "★" : "☆"}
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={act === "find" + s.seasonNumber}
                          title="Найти весь сезон (force search)"
                          onClick={(e) => { e.stopPropagation(); findSeason(s.seasonNumber); }}
                        >
                          {act === "find" + s.seasonNumber ? "…" : "⬇ Сезон"}
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-sm"
                      disabled={tvdbId == null}
                      title={tvdbId == null ? "Нет tvdbId" : "Выбрать раздачу для сезона"}
                      onClick={(e) => { e.stopPropagation(); setPickerSeason(pickerOn ? null : s.seasonNumber); }}
                    >
                      🔍 Раздача
                    </button>
                    <span className="det-season-chev" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', display: 'inline-flex', alignItems: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  </button>

                  {pickerOn && tvdbId != null && (
                    <ReleasePicker params={{ type: "series", id: tvdbId, seasonNumber: s.seasonNumber }} onGrabbed={onMediaUpdate} />
                  )}

                  <div className={`det-eps-wrap${isOpen ? ' det-eps-open' : ''}`}>
                    <div className="det-eps-list">
                      {s.episodes.map((ep) => {
                        const missed = !ep.hasFile && isAired(ep.airDate);
                        return (
                          <div key={`${ep.seasonNumber}-${ep.episodeNumber}`} className={`det-ep ${ep.played ? "media-ep-played" : ""}`}>
                            {ep.jellyfinId ? (
                              <img className="media-ep-thumb" src={jellyfinPosterUrl(ep.jellyfinId)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                            ) : (
                              <span className="media-ep-thumb media-ep-thumb-ph" />
                            )}
                            <span className="det-ep-n lmono">{String(ep.episodeNumber ?? 0).padStart(2, '0')}</span>
                            <span className="det-ep-title" title={ep.title}>{ep.title}</span>
                            {ep.hasFile ? (
                              <span className="rel-badge">{ep.quality ?? "есть"}{ep.size ? ` · ${fmtSize(ep.size)}` : ""}</span>
                            ) : missed ? (
                              <span className="mediadetail-missing media-ep-missed">пропущено</span>
                            ) : (
                              <span className="mediadetail-missing">нет файла</span>
                            )}
                            <span className="det-ep-dur lmono" title={fmtAir(ep.airDate)}>{relAir(ep.airDate)}</span>
                            <button
                              className="det-ep-play"
                              style={{ '--epa': accent } as React.CSSProperties}
                              title={ep.jellyfinId ? "Воспроизвести" : "Файл недоступен"}
                              disabled={!ep.jellyfinId || busy === ep.jellyfinId}
                              onClick={() => ep.jellyfinId && play(ep.jellyfinId, `${det.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`)}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 21,12 6,21"/></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ПОХОЖИЕ */}
        {similarItems.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="det-sec-label">ПОХОЖИЕ</div>
            <div className="lib-h-track lib-poster-row">
              {similarItems.map(item => {
                const a = titleAccent(item.name);
                const aGrad = `radial-gradient(ellipse at 60% 40%, ${a}88 0%, ${a}22 50%, #050508 100%)`;
                return (
                  <div key={item.id} className="poster-card"
                    onClick={() => nav(`/media/${item.type === 'Series' ? 'series' : 'movie'}/${item.id}`)}>
                    <div className="poster-art" style={{ '--pa': a } as React.CSSProperties}>
                      <div style={{ position: 'absolute', inset: 0, background: aGrad, zIndex: 0 }} />
                      <img
                        src={jellyfinPosterUrl(item.id)}
                        alt=""
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      {item.childCount ? <span className="poster-badge" style={{ position: 'relative', zIndex: 2 }}>{item.childCount} сез.</span> : null}
                      <div className="poster-overlay" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 8 }}>
                        <div className="poster-play-btn">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 21,12 6,21"/></svg>
                        </div>
                      </div>
                    </div>
                    <div className="poster-info">
                      <div className="poster-title">{item.name}</div>
                      <div className="poster-sub lmono">{item.type === 'Series' ? 'сериал' : 'фильм'}{item.year ? ` · ${item.year}` : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
