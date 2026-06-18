// Детальная страница фильма (/media/movie/:id) — Radarr-style: шапка с
// метаданными, статус файла (качество/размер или «отсутствует»), встроенный
// плеер + игра на устройство, поиск раздач и ручной импорт застрявшей раздачи.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "../Card.tsx";
import { Player, ReleasePicker, ImportDrawer, fmtSize } from "./mediaShared.tsx";
import {
  getMoviePageDetail, getMediaPlayUrl, getMediaDevices, playOnDevice, posterUrl, jellyfinPosterUrl,
  type MoviePageDetail, type DownloadItem, type MediaData, type PlayDevice,
} from "../../lib/api.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");

export function MediaMoviePage({ media, onMediaUpdate }: { media: MediaData; onMediaUpdate: () => void }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<MoviePageDetail | null | "loading">("loading");
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [importItem, setImportItem] = useState<DownloadItem | null>(null);
  const [devices, setDevices] = useState<PlayDevice[]>([]);
  const [castOpen, setCastOpen] = useState(false);

  useEffect(() => {
    setD("loading");
    getMoviePageDetail(id).then((r) => setD(r));
    getMediaDevices().then(setDevices);
  }, [id]);

  const play = async () => {
    setBusy(true);
    const url = await getMediaPlayUrl(id);
    setBusy(false);
    if (url && d && d !== "loading") setPlayer({ url, title: d.title });
  };

  if (d === "loading") return <div className="page"><div className="empty" style={{ marginTop: 40 }}>Загружаем…</div></div>;
  if (!d) return <div className="page"><div className="empty" style={{ marginTop: 40 }}>Не удалось загрузить фильм.</div></div>;

  const poster = d.posterRemote ? posterUrl(d.posterRemote) : jellyfinPosterUrl(d.jellyfinId);
  const stuck = media.downloads.filter(
    (x) => x.importPending && x.source === "radarr" && norm(x.title).includes(norm(d.title)),
  );

  return (
    <div className="page">
      {player && <Player url={player.url} title={player.title} onClose={() => setPlayer(null)} />}
      {importItem && (
        <ImportDrawer
          item={importItem}
          onClose={() => setImportItem(null)}
          onDone={() => { setImportItem(null); onMediaUpdate(); getMoviePageDetail(id).then(setD); }}
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
            {!d.inArr && <span className="rel-reject" title="Нет в Radarr — данные из Jellyfin">только Jellyfin</span>}
            {d.genres.slice(0, 5).map((g) => <span key={g} className="rel-lang">{g}</span>)}
          </div>
          <div className="mediadetail-facts mono">
            {[d.studio, d.runtime ? `${d.runtime} мин` : "", d.rating ? `★ ${d.rating.toFixed(1)}` : ""].filter(Boolean).join("  ·  ")}
          </div>
          {d.overview && <p className="mediadetail-overview">{d.overview}</p>}

          <div className="mediadetail-filerow">
            {d.hasFile ? (
              <span className="rel-badge">{d.quality ?? "файл есть"}{d.size ? ` · ${fmtSize(d.size)}` : ""}</span>
            ) : (
              <span className="mediadetail-missing">Файл отсутствует</span>
            )}
            {d.hasFile && (
              <button className="btn btn-sm btn-accent" disabled={busy} onClick={play}>{busy ? "…" : "▶ Смотреть"}</button>
            )}
            {d.hasFile && devices.length > 0 && (
              <div className="media-cast">
                <button className="btn btn-icon btn-sm" title="Играть на устройстве" onClick={() => setCastOpen((v) => !v)}>📺</button>
                {castOpen && (
                  <div className="media-cast-menu neu">
                    {devices.map((dev) => (
                      <button key={dev.id} className="media-cast-item" onClick={() => { playOnDevice(dev.id, d.jellyfinId); setCastOpen(false); }}>
                        {dev.deviceName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {stuck.map((s) => (
              <button key={s.hash} className="btn btn-sm btn-accent" onClick={() => setImportItem(s)}>⚠ Импорт застрявшей</button>
            ))}
          </div>
        </div>
      </div>

      <Card
        icon="cloud"
        title="Раздачи"
        action={
          <button className="btn btn-sm" disabled={d.tmdbId == null} title={d.tmdbId == null ? "Нет tmdbId" : ""} onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? "Скрыть" : "🔍 Найти"}
          </button>
        }
      >
        {showPicker && d.tmdbId != null ? (
          <ReleasePicker params={{ type: "movie", id: d.tmdbId }} onGrabbed={onMediaUpdate} />
        ) : (
          <div className="empty">Нажми «Найти», чтобы искать раздачи с нужной озвучкой/качеством.</div>
        )}
      </Card>
    </div>
  );
}
