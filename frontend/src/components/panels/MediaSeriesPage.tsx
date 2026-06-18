// Детальная страница сериала (/media/series/:id) — Sonarr-style: шапка с
// метаданными, полный список сезонов/эпизодов (скачано/нет, качество, дата),
// встроенный плеер, поиск раздач на сезон и ручной импорт застрявшей раздачи.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "../Card.tsx";
import { Player, ReleasePicker, ImportDrawer, fmtSize } from "./mediaShared.tsx";
import {
  getSeriesPageDetail, getMediaPlayUrl, posterUrl, jellyfinPosterUrl,
  type SeriesPageDetail, type DownloadItem, type MediaData,
} from "../../lib/api.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
const fmtAir = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "");

export function MediaSeriesPage({ media, onMediaUpdate }: { media: MediaData; onMediaUpdate: () => void }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<SeriesPageDetail | null | "loading">("loading");
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [pickerSeason, setPickerSeason] = useState<number | null>(null);
  const [importItem, setImportItem] = useState<DownloadItem | null>(null);

  useEffect(() => {
    setD("loading");
    getSeriesPageDetail(id).then((r) => setD(r));
  }, [id]);

  const play = async (jellyfinId: string, title: string) => {
    setBusy(jellyfinId);
    const url = await getMediaPlayUrl(jellyfinId);
    setBusy(null);
    if (url) setPlayer({ url, title });
  };

  if (d === "loading") return <div className="page"><div className="empty" style={{ marginTop: 40 }}>Загружаем…</div></div>;
  if (!d) return <div className="page"><div className="empty" style={{ marginTop: 40 }}>Не удалось загрузить сериал.</div></div>;

  const poster = d.posterRemote ? posterUrl(d.posterRemote) : jellyfinPosterUrl(d.jellyfinId);
  const stuck = media.downloads.filter(
    (x) => x.importPending && x.source === "sonarr" && norm(x.title).includes(norm(d.title)),
  );

  return (
    <div className="page">
      {player && <Player url={player.url} title={player.title} onClose={() => setPlayer(null)} />}
      {importItem && (
        <ImportDrawer
          item={importItem}
          onClose={() => setImportItem(null)}
          onDone={() => { setImportItem(null); onMediaUpdate(); getSeriesPageDetail(id).then(setD); }}
        />
      )}

      <button className="btn btn-sm mediadetail-back" onClick={() => nav("/media")}>← Медиатека</button>

      <div className="card neu mediadetail-head">
        {poster && (
          <img className="mediadetail-poster" src={poster} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
        <div className="mediadetail-info">
          <div className="mediadetail-titlerow">
            <h1 className="mediadetail-title">{d.title}</h1>
            {d.year && <span className="mediadetail-year mono">{d.year}</span>}
          </div>
          <div className="mediadetail-badges">
            {d.status && <span className="rel-badge">{d.status}</span>}
            {!d.inArr && <span className="rel-reject" title="Нет в Sonarr — данные из Jellyfin">только Jellyfin</span>}
            {d.genres.slice(0, 5).map((g) => <span key={g} className="rel-lang">{g}</span>)}
          </div>
          <div className="mediadetail-facts mono">
            {[d.network, d.runtime ? `${d.runtime} мин` : "", d.rating ? `★ ${d.rating.toFixed(1)}` : ""].filter(Boolean).join("  ·  ")}
          </div>
          {d.overview && <p className="mediadetail-overview">{d.overview}</p>}
          {stuck.map((s) => (
            <button key={s.hash} className="btn btn-sm btn-accent" style={{ marginTop: 8 }} onClick={() => setImportItem(s)}>
              ⚠ Импорт застрявшей раздачи
            </button>
          ))}
        </div>
      </div>

      {d.seasons.length === 0 ? (
        <Card icon="pulse" title="Эпизоды"><div className="empty">Эпизоды не найдены.</div></Card>
      ) : (
        d.seasons.map((s) => {
          const isOpen = openSeason === s.seasonNumber;
          const pickerOn = pickerSeason === s.seasonNumber;
          const label = s.seasonNumber === 0 ? "Спецвыпуски" : `Сезон ${s.seasonNumber}`;
          return (
            <div key={s.seasonNumber} className="media-season">
              <div className="media-season-head">
                <button className="media-season-toggle" onClick={() => setOpenSeason(isOpen ? null : s.seasonNumber)}>
                  <span>{isOpen ? "▾" : "▸"} {label}</span>
                  <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{s.fileCount}/{s.totalCount}</span>
                </button>
                <button
                  className="btn btn-sm"
                  disabled={d.tvdbId == null}
                  title={d.tvdbId == null ? "Нет tvdbId" : "Найти раздачу для сезона"}
                  onClick={() => setPickerSeason(pickerOn ? null : s.seasonNumber)}
                >
                  🔍 Раздача
                </button>
              </div>

              {pickerOn && d.tvdbId != null && (
                <ReleasePicker params={{ type: "series", id: d.tvdbId, seasonNumber: s.seasonNumber }} onGrabbed={onMediaUpdate} />
              )}

              {isOpen && (
                <div className="media-ep-list">
                  {s.episodes.map((ep) => (
                    <div key={`${ep.seasonNumber}-${ep.episodeNumber}`} className={`mediadetail-ep ${ep.played ? "media-ep-played" : ""}`}>
                      <span className="media-ep-num mono">{ep.episodeNumber}</span>
                      <span className="mediadetail-ep-title" title={ep.title}>{ep.title}</span>
                      <span className="mediadetail-ep-air mono">{fmtAir(ep.airDate)}</span>
                      {ep.hasFile ? (
                        <span className="rel-badge">{ep.quality ?? "есть"}{ep.size ? ` · ${fmtSize(ep.size)}` : ""}</span>
                      ) : (
                        <span className="mediadetail-missing">нет файла</span>
                      )}
                      <button
                        className="btn btn-icon btn-sm"
                        title={ep.jellyfinId ? "Воспроизвести" : "Файл недоступен"}
                        disabled={!ep.jellyfinId || busy === ep.jellyfinId}
                        onClick={() => ep.jellyfinId && play(ep.jellyfinId, `${d.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`)}
                      >
                        {busy === ep.jellyfinId ? "…" : "▶"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
