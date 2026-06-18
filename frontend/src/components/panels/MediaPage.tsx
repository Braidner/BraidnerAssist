// Страница /media — Jellyfin (что играет + библиотека + встроенный плеер),
// очередь загрузок (Sonarr/Radarr/qBittorrent с управлением) и добавление торрентов
// (прямой magnet + поиск через Prowlarr — в выезжающем дравере у загрузок).

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Card } from "../Card.tsx";
import { Placeholder } from "./Placeholder.tsx";
import {
  getMediaLibrary, getMediaPlayUrl, searchReleases, addTorrent, torrentAction, refreshJellyfin,
  lookupTitle, addTitle, posterUrl, jellyfinPosterUrl, getMediaDevices, playOnDevice, getRecommendations,
  getSeriesDetail, searchReleaseOptions, grabRelease,
  getImportCandidates, executeImport,
  type MediaData, type DownloadItem, type LibraryItem, type SearchResult, type ArrLookupItem,
  type PlayDevice, type Recommendation, type SeriesDetail, type ReleaseOption, type ManualImportFile,
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
          <button className="btn btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <video ref={videoRef} controls autoPlay style={{ width: "100%", borderRadius: 12, background: "#000" }} />
      </div>
    </div>
  );
}

// ── Интерактивный выбор раздачи (Sonarr/Radarr /release) ──────────────
// Показывает релизы с качеством/озвучкой/сидами; отклонённые (multi-season
// и т.п.) выделены, но грабятся принудительно через force-grab.
function ReleasePicker({
  params, onGrabbed,
}: {
  params: { type: "movie" | "series"; id: number; seasonNumber?: number };
  onGrabbed?: () => void;
}) {
  const [releases, setReleases] = useState<ReleaseOption[] | null>(null);
  const [busyGuid, setBusyGuid] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setReleases(null);
    searchReleaseOptions(params).then((r) => { if (alive) setReleases(r); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.type, params.id, params.seasonNumber]);

  const onGrab = async (r: ReleaseOption) => {
    setBusyGuid(r.guid);
    const ok = await grabRelease({ type: params.type, guid: r.guid, indexerId: r.indexerId });
    setBusyGuid(null);
    if (ok) {
      setDone((p) => ({ ...p, [r.guid]: true }));
      onGrabbed?.();
    }
  };

  if (releases === null) return <div className="empty" style={{ marginTop: 10 }}>Ищем раздачи…</div>;
  if (releases.length === 0) return <div className="empty" style={{ marginTop: 10 }}>Раздачи не найдены.</div>;

  return (
    <div className="sr-list">
      {releases.map((r) => (
        <div key={r.guid} className={`sr-row ${r.rejected ? "rel-rejected" : ""}`}>
          <span className="sr-title" title={r.title}>{r.title}</span>
          <div className="sr-foot" style={{ flexWrap: "wrap", gap: 6 }}>
            <span className="sr-meta" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="rel-badge">{r.quality}</span>
              {r.languages.map((l) => <span key={l} className="rel-lang">{l}</span>)}
              <span>{fmtSize(r.size)}</span>
              <span className="sr-seeds">{r.seeders ?? 0} seed</span>
              <span>{r.indexer}</span>
              {r.rejected && (
                <span className="rel-reject" title={r.rejections.join("; ")}>⚠ отклонён</span>
              )}
            </span>
            <button
              className="btn btn-sm btn-accent"
              disabled={busyGuid === r.guid || done[r.guid]}
              onClick={() => onGrab(r)}
            >
              {done[r.guid] ? "✓ В очереди" : busyGuid === r.guid ? "…" : "Скачать"}
            </button>
          </div>
          {done[r.guid] && /multi-season/i.test(r.rejections.join(" ")) && (
            <div className="rel-reject" style={{ fontSize: 10.5 }}>
              Пак нескольких сезонов — после скачивания нажми «Импорт» в Загрузках, чтобы разложить серии.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Дравер сериала: аккордеон сезонов → эпизоды (play) + выбор раздачи на сезон ──
function SeriesDrawer({
  item, onClose, onPlay, busy,
}: {
  item: LibraryItem;
  onClose: () => void;
  onPlay: (episodeId: string, title: string) => void;
  busy: string | null;
}) {
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [pickerSeason, setPickerSeason] = useState<number | null>(null);

  useEffect(() => {
    getSeriesDetail(item.id).then(setDetail);
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open">
        <div className="drawer-inner">
          <div className="drawer-head">
            <span className="drawer-kind">{item.name}</span>
            <button className="btn btn-icon btn-sm" onClick={onClose}>✕</button>
          </div>

          {detail === null ? (
            <div className="empty" style={{ marginTop: 12 }}>Загружаем сезоны…</div>
          ) : detail.seasons.length === 0 ? (
            <div className="empty" style={{ marginTop: 12 }}>Эпизоды не найдены.</div>
          ) : (
            detail.seasons.map((s) => {
              const isOpen = openSeason === s.seasonNumber;
              const pickerOn = pickerSeason === s.seasonNumber;
              const label = s.seasonNumber === 0 ? "Спецвыпуски" : `Сезон ${s.seasonNumber}`;
              return (
                <div key={s.seasonNumber} className="media-season">
                  <div className="media-season-head">
                    <button
                      className="media-season-toggle"
                      onClick={() => setOpenSeason(isOpen ? null : s.seasonNumber)}
                    >
                      <span>{isOpen ? "▾" : "▸"} {label}</span>
                      <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{s.episodes.length} эп.</span>
                    </button>
                    <button
                      className="btn btn-sm"
                      disabled={item.tvdbId == null}
                      title={item.tvdbId == null ? "Нет tvdbId — пересканируйте библиотеку" : "Найти раздачу для сезона"}
                      onClick={() => setPickerSeason(pickerOn ? null : s.seasonNumber)}
                    >
                      🔍 Раздача
                    </button>
                  </div>

                  {pickerOn && item.tvdbId != null && (
                    <ReleasePicker params={{ type: "series", id: item.tvdbId, seasonNumber: s.seasonNumber }} />
                  )}

                  {isOpen && (
                    <div className="media-ep-list">
                      {s.episodes.map((ep) => (
                        <div key={ep.id} className={`media-ep-row ${ep.played ? "media-ep-played" : ""}`}>
                          <span className="media-ep-num mono">{ep.episodeNumber ?? "—"}</span>
                          <span className="media-ep-name" title={ep.name}>{ep.name}</span>
                          <button
                            className="btn btn-icon btn-sm"
                            title="Воспроизвести"
                            disabled={busy === ep.id}
                            onClick={() => onPlay(ep.id, `${item.name} — S${s.seasonNumber}E${ep.episodeNumber ?? "?"} ${ep.name}`)}
                          >
                            {busy === ep.id ? "…" : "▶"}
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
      </aside>
    </>
  );
}

// Клиентский предвыбор: по одному лучшему файлу на серию/фильм (дедуп копий).
function autoSelectFiles(files: ManualImportFile[], kind: "movie" | "series"): Set<number> {
  const usable = files.filter((f) => {
    if (f.rejections.some((m) => /not an upgrade|already imported/i.test(m))) return false;
    return kind === "series" ? f.episodes.length > 0 : Boolean(f.movieTitle);
  });
  const best = new Map<string, ManualImportFile>();
  for (const f of usable) {
    const keys = kind === "series"
      ? f.episodes.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`)
      : [`movie-${f.movieTitle}`];
    for (const key of keys) {
      const prev = best.get(key);
      if (!prev || f.rejections.length < prev.rejections.length ||
          (f.rejections.length === prev.rejections.length && f.size > prev.size)) {
        best.set(key, f);
      }
    }
  }
  return new Set([...best.values()].map((f) => f.id));
}

// Дравер ручного импорта застрявшей раздачи: файлы по сезонам/сериям, флажки,
// предвыбран один файл на серию (дедуп копий с разной озвучкой), «Импорт».
function ImportDrawer({
  item, onClose, onDone,
}: {
  item: DownloadItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const kind: "movie" | "series" = item.source === "radarr" ? "movie" : "series";
  const downloadId = item.downloadId ?? item.hash;
  const [files, setFiles] = useState<ManualImportFile[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getImportCandidates({ type: kind, downloadId }).then((fs) => {
      setFiles(fs);
      setSel(autoSelectFiles(fs, kind));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: number) => setSel((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const onImport = async () => {
    setBusy(true);
    const ok = await executeImport({ type: kind, downloadId, fileIds: [...sel] });
    setBusy(false);
    if (ok) onDone();
  };

  // Группировка по сезонам (series) либо плоский список (movie).
  const groups = (() => {
    if (!files) return [];
    if (kind === "movie") return [{ key: -1, label: "Файлы", files }] as { key: number; label: string; files: ManualImportFile[] }[];
    const map = new Map<number, ManualImportFile[]>();
    for (const f of files) {
      const sn = f.episodes[0]?.seasonNumber ?? f.seasonNumber ?? 0;
      if (!map.has(sn)) map.set(sn, []);
      map.get(sn)!.push(f);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([sn, fs]) => ({
      key: sn,
      label: sn === 0 ? "Спецвыпуски" : `Сезон ${sn}`,
      files: fs.sort((a, b) => (a.episodes[0]?.episodeNumber ?? 0) - (b.episodes[0]?.episodeNumber ?? 0)),
    }));
  })();

  const fileLabel = (f: ManualImportFile) => {
    if (kind === "series" && f.episodes.length > 0) {
      const e = f.episodes[0];
      const range = f.episodes.length > 1 ? `–E${f.episodes[f.episodes.length - 1].episodeNumber}` : "";
      return `S${e.seasonNumber}E${e.episodeNumber}${range}`;
    }
    return f.movieTitle ?? "—";
  };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open">
        <div className="drawer-inner">
          <div className="drawer-head">
            <span className="drawer-kind">Импорт: {item.title}</span>
            <button className="btn btn-icon btn-sm" onClick={onClose}>✕</button>
          </div>

          {files === null ? (
            <div className="empty" style={{ marginTop: 12 }}>Сканируем файлы…</div>
          ) : files.length === 0 ? (
            <div className="empty" style={{ marginTop: 12 }}>Файлы для импорта не найдены.</div>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.key} className="media-season">
                  <div className="media-season-head">
                    <span className="media-season-toggle" style={{ cursor: "default" }}>{g.label}</span>
                    <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{g.files.length} файл.</span>
                  </div>
                  <div className="media-ep-list">
                    {g.files.map((f) => (
                      <label key={f.id} className="imp-row">
                        <input type="checkbox" className="imp-check" checked={sel.has(f.id)} onChange={() => toggle(f.id)} />
                        <span className="media-ep-num mono">{fileLabel(f)}</span>
                        <span className="imp-meta">
                          <span className="rel-badge">{f.quality}</span>
                          {f.languages.map((l) => <span key={l} className="rel-lang">{l}</span>)}
                          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{fmtSize(f.size)}</span>
                          {f.rejections.length > 0 && (
                            <span className="rel-reject" title={f.rejections.join("; ")}>⚠</span>
                          )}
                          <span className="imp-path" title={f.relativePath}>{f.relativePath}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button className="btn btn-accent" style={{ width: "100%", marginTop: 16 }} disabled={busy || sel.size === 0} onClick={onImport}>
                {busy ? "Импортируем…" : `Импортировать выбранное (${sel.size})`}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// Дравер «Добавить»: основной путь — поиск тайтла в Radarr/Sonarr (правильный
// пайплайн в медиатеку); ниже — ручные опции (прямой magnet + raw-поиск Prowlarr).
function AddTorrentDrawer({
  open, onClose, onAdd, onAddTitle, onGrabbed, busy,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (url: string, key: string) => Promise<void>;
  onAddTitle: (item: ArrLookupItem, key: string) => Promise<boolean>;
  onGrabbed: () => void;
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
                        <button
                          className="btn btn-sm btn-accent"
                          disabled={!r.url || busy === r.guid}
                          onClick={() => r.url && onAdd(r.url, r.guid)}
                        >
                          {busy === r.guid ? "…" : "Скачать"}
                        </button>
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

export function MediaPage({ media, onMediaUpdate }: { media: MediaData; onMediaUpdate: () => void }) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState<LibraryItem | null>(null);
  const [importFor, setImportFor] = useState<DownloadItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (media.configured) getMediaLibrary().then(setLibrary);
  }, [media.configured]);

  const [devices, setDevices] = useState<PlayDevice[]>([]);
  const [castFor, setCastFor] = useState<string | null>(null);

  useEffect(() => {
    if (media.configured) getMediaDevices().then(setDevices);
  }, [media.configured]);

  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    if (media.configured) getRecommendations().then(setRecs);
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

  const onPlayId = async (id: string, title: string) => {
    setBusy(id);
    const url = await getMediaPlayUrl(id);
    setBusy(null);
    if (url) setPlayer({ url, title });
  };

  const onPlay = (item: LibraryItem) => onPlayId(item.id, item.name);

  const onCast = async (item: LibraryItem, device: PlayDevice) => {
    setBusy("cast" + item.id);
    await playOnDevice(device.id, item.id);
    setBusy(null);
    setCastFor(null);
  };

  const onAdd = async (url: string, key: string) => {
    setBusy(key);
    const ok = await addTorrent(url);
    setBusy(null);
    if (ok) onMediaUpdate();
  };

  const onAddTitle = async (item: ArrLookupItem, key: string): Promise<boolean> => {
    setBusy(key);
    const ok = await addTitle(item.kind, item.id);
    setBusy(null);
    if (ok) onMediaUpdate();
    return ok;
  };

  const onAddRec = async (rec: Recommendation) => {
    const key = "rec" + rec.kind + rec.id;
    setBusy(key);
    const okAdd = await addTitle(rec.kind, rec.id);
    setBusy(null);
    if (okAdd) {
      setRecs((prev) => prev.filter((r) => !(r.kind === rec.kind && r.id === rec.id)));
      onMediaUpdate();
    }
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
      <AddTorrentDrawer open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAdd} onAddTitle={onAddTitle} onGrabbed={onMediaUpdate} busy={busy} />
      {seriesOpen && (
        <SeriesDrawer
          item={seriesOpen}
          onClose={() => setSeriesOpen(null)}
          onPlay={onPlayId}
          busy={busy}
        />
      )}
      {importFor && (
        <ImportDrawer
          item={importFor}
          onClose={() => setImportFor(null)}
          onDone={() => { setImportFor(null); onMediaUpdate(); refreshJellyfin(); }}
        />
      )}

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
              <button className="btn btn-sm" onClick={() => refreshJellyfin().then(() => getMediaLibrary().then(setLibrary))}>
                Сканировать
              </button>
            }
          >
            {library.length === 0 ? (
              <div className="empty">Библиотека пуста или ещё не отсканирована.</div>
            ) : (
              <div className="media-grid">
                {library.map((it) => {
                  const isSeries = it.type === "Series";
                  return (
                    <div key={it.id} className="media-item-wrap">
                      <button
                        className="neu media-item"
                        disabled={busy === it.id}
                        onClick={() => (isSeries ? setSeriesOpen(it) : onPlay(it))}
                        title={it.name}
                      >
                        <img
                          className="media-item-poster"
                          src={jellyfinPosterUrl(it.id)}
                          alt=""
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                        <span className="media-item-name">{it.name}</span>
                        <span className="media-item-meta mono">
                          {isSeries
                            ? `📺${it.childCount ? ` · ${it.childCount} сез.` : ""}`
                            : "фильм"}
                          {it.year ? ` · ${it.year}` : ""}
                        </span>
                        <span className="media-item-play">{busy === it.id ? "…" : isSeries ? "›" : "▶"}</span>
                      </button>
                      {!isSeries && devices.length > 0 && (
                        <div className="media-cast">
                          <button
                            className="btn btn-icon btn-sm media-cast-btn"
                            title="Играть на устройстве"
                            onClick={() => setCastFor(castFor === it.id ? null : it.id)}
                          >
                            📺
                          </button>
                          {castFor === it.id && (
                            <div className="media-cast-menu neu">
                              {devices.map((d) => (
                                <button
                                  key={d.id}
                                  className="media-cast-item"
                                  disabled={busy === "cast" + it.id}
                                  onClick={() => onCast(it, d)}
                                >
                                  {d.deviceName}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Подборки — ещё не в библиотеке */}
          {recs.length > 0 && (
            <Card icon="pulse" title="Подборки" action={<span className="panel-count">{recs.length}</span>}>
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
            </Card>
          )}
        </div>

        <div className="page-col-side">
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
        </div>
      </div>
    </div>
  );
}
