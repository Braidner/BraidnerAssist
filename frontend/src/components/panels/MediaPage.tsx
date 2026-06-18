// Страница /media — Jellyfin (что играет + библиотека + встроенный плеер),
// очередь загрузок (Sonarr/Radarr/qBittorrent с управлением) и добавление торрентов
// (прямой magnet + поиск через Prowlarr — в выезжающем дравере у загрузок).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../Card.tsx";
import { Placeholder } from "./Placeholder.tsx";
import {
  getMediaLibrary, searchReleases, addTorrent, torrentAction, refreshJellyfin,
  lookupTitle, addTitle, posterUrl, jellyfinPosterUrl, getRecommendations,
  type MediaData, type DownloadItem, type LibraryItem, type SearchResult, type ArrLookupItem,
  type Recommendation,
} from "../../lib/api.ts";
import {
  ReleasePicker, ImportDrawer, ProgressBar, fmtSize, fmtSpeed, fmtEta,
} from "./mediaShared.tsx";

const SOURCE_LABEL: Record<DownloadItem["source"], string> = {
  sonarr: "Sonarr",
  radarr: "Radarr",
  qbittorrent: "qBittorrent",
};

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
  const nav = useNavigate();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [importFor, setImportFor] = useState<DownloadItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (media.configured) getMediaLibrary().then(setLibrary);
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

  const openDetail = (it: LibraryItem) =>
    nav(`/media/${it.type === "Series" ? "series" : "movie"}/${it.id}`);

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
      <AddTorrentDrawer open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAdd} onAddTitle={onAddTitle} onGrabbed={onMediaUpdate} busy={busy} />
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
                        onClick={() => openDetail(it)}
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
                        <span className="media-item-play">›</span>
                      </button>
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
