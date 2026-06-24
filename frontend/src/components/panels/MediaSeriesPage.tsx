// Детальная страница сериала (/media/series/:id) — Sonarr-style: шапка с
// метаданными и monitor/поиском, полный список сезонов/эпизодов (скачано/нет,
// качество, дата, превью), прогресс по сезону, встроенный плеер, поиск раздач
// на сезон, bulk-поиск недостающих и ручной импорт застрявшей раздачи.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "../Card.tsx";
import { Player, ReleasePicker, ImportDrawer, ProgressBar, fmtSize } from "./mediaShared.tsx";
import { TorrentFilePicker, ContentTorrents } from "./mediaPick.tsx";
import {
  getSeriesPageDetail, getSeriesDiscoverDetail, addTitle,
  getMediaPlayUrl, posterUrl, jellyfinPosterUrl, seasonSearch, setMonitored,
  type SeriesPageDetail, type DownloadItem, type MediaData,
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

export function MediaSeriesPage({ media, onMediaUpdate, source = "library" }: { media: MediaData; onMediaUpdate: () => void; source?: "library" | "discover" }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<SeriesPageDetail | null | "loading">("loading");
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

  const det = d; // d сужен до SeriesPageDetail ниже
  const tvdbId = det.tvdbId;

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

  const poster = det.posterRemote ? posterUrl(det.posterRemote) : jellyfinPosterUrl(det.jellyfinId);
  // Один и тот же пак приходит несколькими queue-записями → дедуп по downloadId.
  const stuck = [
    ...new Map(
      media.downloads
        .filter((x) => x.importPending && x.source === "sonarr" && norm(x.title).includes(norm(det.title)))
        .map((x) => [x.downloadId ?? x.hash, x]),
    ).values(),
  ];

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

      <button className="btn btn-sm mediadetail-back" onClick={() => nav("/media")}>← Медиатека</button>

      <div className="card neu mediadetail-head">
        {poster && (
          <img className="mediadetail-poster" src={poster} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
        <div className="mediadetail-info">
          <div className="mediadetail-titlerow">
            <h1 className="mediadetail-title">{det.title}</h1>
            {det.year && <span className="mediadetail-year mono">{det.year}</span>}
          </div>
          <div className="mediadetail-badges">
            {det.status && <span className="rel-badge">{det.status}</span>}
            {!det.inArr && <span className="rel-reject" title="Нет в Sonarr — данные из Jellyfin">только Jellyfin</span>}
            {det.genres.slice(0, 5).map((g) => <span key={g} className="rel-lang">{g}</span>)}
          </div>
          <div className="mediadetail-facts mono">
            {[det.network, det.runtime ? `${det.runtime} мин` : "", det.rating ? `★ ${det.rating.toFixed(1)}` : ""].filter(Boolean).join("  ·  ")}
          </div>
          {det.overview && <p className="mediadetail-overview">{det.overview}</p>}

          <div className="mediadetail-actions">
            {!det.inArr && tvdbId != null && (
              <button className="btn btn-sm btn-accent" disabled={act === "add"} title="Добавить в Sonarr и запустить поиск" onClick={addToLib}>
                {act === "add" ? "…" : "➕ В библиотеку"}
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
        </div>
      </div>

      {/* Качается из торрента (Media v2) — прогресс по сериям + докачать ещё */}
      <ContentTorrents contentType="series" tvdbId={tvdbId} reloadKey={pickReload} />

      {/* Пофайловый выбор серий из торрента (Media v2) */}
      <Card
        icon="cloud"
        title="Скачать по сериям (торрент)"
        action={<button className="btn btn-sm" onClick={() => setShowPick((v) => !v)}>{showPick ? "Скрыть" : "🔍 Выбрать серии"}</button>}
      >
        {showPick ? (
          <TorrentFilePicker contentType="series" tvdbId={tvdbId} title={det.title} onGrabbed={() => setPickReload((n) => n + 1)} />
        ) : (
          <div className="empty">Найди раздачу и отметь галками нужные серии — качаем только их.</div>
        )}
      </Card>

      {showAllPicker && tvdbId != null && (
        <Card icon="cloud" title="Все раздачи сериала">
          <div className="mediadetail-facts mono" style={{ marginBottom: 8 }}>
            Включая мультисезонные паки. Отметь нужные и нажми «Скачать выбранное». После загрузки пака
            разложи серии по сезонам кнопкой «Импорт» в Загрузках.
          </div>
          <ReleasePicker params={{ type: "series", id: tvdbId }} onGrabbed={onMediaUpdate} />
        </Card>
      )}

      {det.seasons.length === 0 ? (
        <Card icon="pulse" title="Эпизоды"><div className="empty">Эпизоды не найдены.</div></Card>
      ) : (
        det.seasons.map((s) => {
          const isOpen = openSeason === s.seasonNumber;
          const pickerOn = pickerSeason === s.seasonNumber;
          const label = s.seasonNumber === 0 ? "Спецвыпуски" : `Сезон ${s.seasonNumber}`;
          const pct = s.totalCount > 0 ? Math.round((s.fileCount / s.totalCount) * 100) : 0;
          return (
            <div key={s.seasonNumber} className="media-season">
              <div className="media-season-head">
                <button className="media-season-toggle" onClick={() => setOpenSeason(isOpen ? null : s.seasonNumber)}>
                  <span>{isOpen ? "▾" : "▸"} {label}</span>
                  <span className="season-prog">
                    <ProgressBar pct={pct} />
                    <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{s.fileCount}/{s.totalCount}</span>
                  </span>
                </button>
                <div className="media-season-actions">
                  {det.inArr && tvdbId != null && (
                    <>
                      <button
                        className={`btn btn-icon btn-sm ${s.monitored ? "btn-accent" : ""}`}
                        disabled={act === "mon" + s.seasonNumber}
                        title={s.monitored ? "Снять сезон с мониторинга" : "Мониторить сезон"}
                        onClick={() => toggleMonitor(!s.monitored, s.seasonNumber)}
                      >
                        {act === "mon" + s.seasonNumber ? "…" : s.monitored ? "★" : "☆"}
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={act === "find" + s.seasonNumber}
                        title="Найти весь сезон (force search)"
                        onClick={() => findSeason(s.seasonNumber)}
                      >
                        {act === "find" + s.seasonNumber ? "…" : "⬇ Сезон"}
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-sm"
                    disabled={tvdbId == null}
                    title={tvdbId == null ? "Нет tvdbId" : "Выбрать раздачу для сезона"}
                    onClick={() => setPickerSeason(pickerOn ? null : s.seasonNumber)}
                  >
                    🔍 Раздача
                  </button>
                </div>
              </div>

              {pickerOn && tvdbId != null && (
                <ReleasePicker params={{ type: "series", id: tvdbId, seasonNumber: s.seasonNumber }} onGrabbed={onMediaUpdate} />
              )}

              {isOpen && (
                <div className="media-ep-list">
                  {s.episodes.map((ep) => {
                    const missed = !ep.hasFile && isAired(ep.airDate);
                    return (
                      <div key={`${ep.seasonNumber}-${ep.episodeNumber}`} className={`mediadetail-ep ${ep.played ? "media-ep-played" : ""}`}>
                        {ep.jellyfinId ? (
                          <img className="media-ep-thumb" src={jellyfinPosterUrl(ep.jellyfinId)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                        ) : (
                          <span className="media-ep-thumb media-ep-thumb-ph" />
                        )}
                        <span className="media-ep-num mono">{ep.episodeNumber}</span>
                        <span className="mediadetail-ep-title" title={ep.title}>{ep.title}</span>
                        <span className="mediadetail-ep-air mono" title={fmtAir(ep.airDate)}>{relAir(ep.airDate)}</span>
                        {ep.hasFile ? (
                          <span className="rel-badge">{ep.quality ?? "есть"}{ep.size ? ` · ${fmtSize(ep.size)}` : ""}</span>
                        ) : missed ? (
                          <span className="mediadetail-missing media-ep-missed">пропущено</span>
                        ) : (
                          <span className="mediadetail-missing">нет файла</span>
                        )}
                        <button
                          className="btn btn-icon btn-sm"
                          title={ep.jellyfinId ? "Воспроизвести" : "Файл недоступен"}
                          disabled={!ep.jellyfinId || busy === ep.jellyfinId}
                          onClick={() => ep.jellyfinId && play(ep.jellyfinId, `${det.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`)}
                        >
                          {busy === ep.jellyfinId ? "…" : "▶"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
