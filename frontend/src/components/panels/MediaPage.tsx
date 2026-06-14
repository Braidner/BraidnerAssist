// Страница /media — Jellyfin (что играет + библиотека + встроенный плеер),
// очередь загрузок (Sonarr/Radarr/qBittorrent с управлением) и добавление торрентов
// (прямой magnet + поиск через Prowlarr).

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Card } from "../Card.tsx";
import { Placeholder } from "./Placeholder.tsx";
import {
  getMediaLibrary, getMediaPlayUrl, searchReleases, addTorrent, torrentAction, refreshJellyfin,
  type MediaData, type DownloadItem, type LibraryItem, type SearchResult,
} from "../../lib/api.ts";
import { getToken } from "../../lib/auth.ts";

const SOURCE_LABEL: Record<DownloadItem["source"], string> = {
  sonarr: "Sonarr",
  radarr: "Radarr",
  qbittorrent: "qBittorrent",
};

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "var(--ok)" : "var(--accent)";
  return (
    <div className="neu-in" style={{ height: 6, borderRadius: 4, overflow: "hidden", flex: 1, minWidth: 80 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color }} />
    </div>
  );
}

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function fmtSpeed(bps?: number): string {
  if (!bps || bps <= 0) return "";
  const mb = bps / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${(bps / 1024).toFixed(0)} KB/s`;
}

function fmtEta(eta?: number | null): string {
  if (eta == null || eta <= 0) return "";
  const h = Math.floor(eta / 3600);
  const m = Math.floor((eta % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

// ── Встроенный HLS-плеер (hls.js + нативный fallback) ──────────────────
function Player({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        // Прикрепляем JWT к каждому сегментному запросу — роут под jwtAuth.
        xhrSetup: (xhr) => {
          const token = getToken();
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        },
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari: нативный HLS (кука/токен через тот же origin).
      video.src = url;
      void video.play().catch(() => {});
    }

    return () => {
      hls?.destroy();
    };
  }, [url]);

  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="player-modal neu" onClick={(e) => e.stopPropagation()}>
        <div className="player-head">
          <span className="player-title">{title}</span>
          <button className="neu-sm player-close" onClick={onClose}>✕</button>
        </div>
        <video ref={videoRef} controls autoPlay style={{ width: "100%", borderRadius: 12, background: "#000" }} />
      </div>
    </div>
  );
}

export function MediaPage({ media, onMediaUpdate }: { media: MediaData; onMediaUpdate: () => void }) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);
  const [magnet, setMagnet] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (media.configured) getMediaLibrary().then(setLibrary);
  }, [media.configured]);

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

  const onPlay = async (item: LibraryItem) => {
    setBusy(item.id);
    const url = await getMediaPlayUrl(item.id);
    setBusy(null);
    if (url) setPlayer({ url, title: item.seriesName ? `${item.seriesName} — ${item.name}` : item.name });
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults(await searchReleases(q));
    setSearching(false);
  };

  const onAdd = async (url: string, key: string) => {
    setBusy(key);
    const ok = await addTorrent(url);
    setBusy(null);
    if (ok) { setMagnet(""); onMediaUpdate(); }
  };

  const onTorrent = async (hash: string, action: "pause" | "resume" | "delete") => {
    setBusy(hash + action);
    await torrentAction(hash, action);
    setBusy(null);
    onMediaUpdate();
  };

  return (
    <div className="page">
      {player && <Player url={player.url} title={player.title} onClose={() => setPlayer(null)} />}

      <div className="page-cols">
        <div className="page-col-main">
          {/* Что играет */}
          <Card icon="pulse" title="Сейчас играет" action={<span className="panel-count">{media.nowPlaying.length}</span>}>
            {media.nowPlaying.length === 0 ? (
              <div className="empty">Ничего не воспроизводится.</div>
            ) : (
              <div className="sys-vm-list" style={{ marginTop: 8 }}>
                {media.nowPlaying.map((np, i) => (
                  <div key={i} className="sys-vm-row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <span className="dot-led" style={{ background: "var(--accent)", boxShadow: "0 0 8px color-mix(in srgb, var(--accent) 70%, transparent)" }} />
                    <span className="sys-vm-name" style={{ minWidth: 160 }}>{np.title}</span>
                    <span className="sys-vm-type mono" style={{ color: "var(--muted)", fontSize: 11 }}>{np.user} · {np.client}</span>
                    {np.positionPct !== null && (
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 120, flex: 1 }}>
                        <ProgressBar pct={np.positionPct} />
                        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{np.positionPct}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Библиотека */}
          <Card
            icon="pulse"
            title="Библиотека"
            action={
              <button className="neu-sm" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => refreshJellyfin().then(() => getMediaLibrary().then(setLibrary))}>
                Сканировать
              </button>
            }
          >
            {library.length === 0 ? (
              <div className="empty">Библиотека пуста или ещё не отсканирована.</div>
            ) : (
              <div className="media-grid">
                {library.map((it) => (
                  <button
                    key={it.id}
                    className="neu media-item"
                    disabled={busy === it.id}
                    onClick={() => onPlay(it)}
                    title={it.seriesName ? `${it.seriesName} — ${it.name}` : it.name}
                  >
                    <span className="media-item-name">{it.seriesName ? `${it.seriesName} — ${it.name}` : it.name}</span>
                    <span className="media-item-meta mono">
                      {it.type === "Episode" ? "эпизод" : it.type === "Movie" ? "фильм" : it.type}
                      {it.year ? ` · ${it.year}` : ""}
                    </span>
                    <span className="media-item-play">{busy === it.id ? "…" : "▶"}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="page-col-side">
          {/* Добавить торрент */}
          <Card icon="cloud" title="Добавить">
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="neu-in mc-input"
                placeholder="magnet:… или .torrent URL"
                value={magnet}
                onChange={(e) => setMagnet(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && magnet.trim()) onAdd(magnet.trim(), "magnet"); }}
              />
              <button className="neu-sm" disabled={!magnet.trim() || busy === "magnet"} onClick={() => onAdd(magnet.trim(), "magnet")}>
                {busy === "magnet" ? "…" : "+"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input
                className="neu-in mc-input"
                placeholder="Поиск в Prowlarr…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
              />
              <button className="neu-sm" disabled={!query.trim() || searching} onClick={onSearch}>
                {searching ? "…" : "🔍"}
              </button>
            </div>

            {results.length > 0 && (
              <div className="sys-vm-list" style={{ marginTop: 10, maxHeight: 280, overflowY: "auto" }}>
                {results.map((r) => (
                  <div key={r.guid} className="sys-vm-row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <span className="sys-vm-name" style={{ minWidth: 140, flex: 1, fontSize: 12 }}>{r.title}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                      {fmtSize(r.size)} · {r.seeders}s · {r.indexer}
                    </span>
                    <button
                      className="neu-sm"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      disabled={!r.url || busy === r.guid}
                      onClick={() => r.url && onAdd(r.url, r.guid)}
                    >
                      {busy === r.guid ? "…" : "Скачать"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Очередь загрузок */}
          <Card icon="cloud" title="Загрузки" action={<span className="panel-count">{media.downloads.length}</span>}>
            {media.downloads.length === 0 ? (
              <div className="empty">Очередь пуста.</div>
            ) : (
              <div className="sys-vm-list" style={{ marginTop: 8 }}>
                {media.downloads.map((d) => {
                  const isQb = d.source === "qbittorrent";
                  const meta = [fmtSpeed(d.dlspeed), fmtEta(d.eta), d.seeds != null ? `${d.seeds}s` : "", fmtSize(d.size)]
                    .filter(Boolean).join(" · ");
                  return (
                    <div key={d.hash} className="sys-vm-row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span className="sys-vm-name" style={{ minWidth: 140, flex: 1 }}>{d.title}</span>
                      <span className="sys-vm-type mono" style={{ color: "var(--muted)", fontSize: 11 }}>{SOURCE_LABEL[d.source]}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140, flex: 1 }}>
                        <ProgressBar pct={d.progress} />
                        <span className="mono" style={{ fontSize: 11, color: "var(--muted)", minWidth: 34, textAlign: "right" }}>{d.progress}%</span>
                      </div>
                      {meta && <span className="mono" style={{ fontSize: 10, color: "var(--muted)", width: "100%" }}>{meta}</span>}
                      {isQb && (
                        <div style={{ display: "flex", gap: 4 }}>
                          {d.state.includes("paused") ? (
                            <button className="neu-sm" style={{ fontSize: 11, padding: "2px 8px" }} disabled={busy === d.hash + "resume"} onClick={() => onTorrent(d.hash, "resume")}>▶</button>
                          ) : (
                            <button className="neu-sm" style={{ fontSize: 11, padding: "2px 8px" }} disabled={busy === d.hash + "pause"} onClick={() => onTorrent(d.hash, "pause")}>⏸</button>
                          )}
                          <button className="neu-sm" style={{ fontSize: 11, padding: "2px 8px" }} disabled={busy === d.hash + "delete"} onClick={() => onTorrent(d.hash, "delete")}>🗑</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
