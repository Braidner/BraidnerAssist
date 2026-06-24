// Media v2 — пофайловый выбор серий из торрента (карточки фильма/сериала):
// поиск раздач (Prowlarr) → предпросмотр файлов (TorrServer, без скачивания) →
// чекбоксы на серии → качаем только выбранное (qB filePrio) + привязка к контенту.
// ContentTorrents — секция «уже качается из этого торрента»: прогресс по файлам +
// докачать ещё серии через ТОТ ЖЕ торрент.

import { useEffect, useState } from "react";
import {
  searchReleases, previewTorrentFiles, grabSelectedFiles, getContentTorrents, pickMoreFiles,
  type SearchResult, type PickFile, type TorrentPreview, type ContentTorrent,
} from "../../lib/api.ts";
import { fmtSize, ProgressBar } from "./mediaShared.tsx";
import { useToast } from "../Toast.tsx";

type Key = { contentType: "movie" | "series"; tmdbId?: number | null; tvdbId?: number | null; title: string };

// Сгруппировать видеофайлы по сезонам (сериал) или плоско (фильм).
function groupBySeason(files: PickFile[]): { key: number; label: string; files: PickFile[] }[] {
  const map = new Map<number, PickFile[]>();
  for (const f of files) {
    const sn = f.season ?? -1;
    if (!map.has(sn)) map.set(sn, []);
    map.get(sn)!.push(f);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sn, fs]) => ({
      key: sn,
      label: sn === -1 ? "Без сезона" : sn === 0 ? "Спецвыпуски" : `Сезон ${sn}`,
      files: fs.sort((a, b) => (a.episodes[0] ?? 0) - (b.episodes[0] ?? 0)),
    }));
}

const epLabel = (f: PickFile): string => {
  if (f.season != null && f.episodes.length > 0) {
    const e = f.episodes;
    const range = e.length > 1 ? `-E${e[e.length - 1]}` : "";
    return `S${f.season}E${e[0]}${range}`;
  }
  return f.path.split("/").pop() ?? f.path;
};

export function TorrentFilePicker({ contentType, tmdbId, tvdbId, title, onGrabbed }: Key & { onGrabbed?: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState(title);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ source: string; title: string } | null>(null);
  const [preview, setPreview] = useState<TorrentPreview | null | "loading">(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [grabbing, setGrabbing] = useState(false);

  const onSearch = async () => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setResults(await searchReleases(term));
    setSearching(false);
  };

  const openTorrent = async (r: SearchResult) => {
    if (!r.url) return;
    setPicked({ source: r.url, title: r.title });
    setPreview("loading");
    setChecked(new Set());
    const pv = await previewTorrentFiles(r.url);
    setPreview(pv);
    if (pv) {
      // дефолт: фильм → крупнейший видеофайл; сериал → все распознанные серии (или все видео).
      const vids = pv.files.filter((f) => f.isVideo);
      if (contentType === "movie") {
        const best = vids.slice().sort((a, b) => b.length - a.length)[0];
        setChecked(new Set(best ? [best.fileIndex] : []));
      } else {
        const withEp = vids.filter((f) => f.episodes.length > 0);
        setChecked(new Set((withEp.length ? withEp : vids).map((f) => f.fileIndex)));
      }
    } else {
      toast.error("Не удалось получить список файлов (TorrServer)");
    }
  };

  const toggle = (idx: number) => setChecked((p) => {
    const n = new Set(p); n.has(idx) ? n.delete(idx) : n.add(idx); return n;
  });

  const onGrab = async () => {
    if (!picked || !preview || preview === "loading" || checked.size === 0) return;
    setGrabbing(true);
    const ok = await grabSelectedFiles({
      contentType, tmdbId, tvdbId, title,
      source: picked.source,
      infohash: preview.infohash,
      files: preview.files,
      wantedIndexes: [...checked],
    });
    setGrabbing(false);
    if (ok) {
      toast.success(`Качаем выбранные файлы: ${checked.size}`);
      setPicked(null); setPreview(null); setChecked(new Set());
      onGrabbed?.();
    } else {
      toast.error("Не удалось поставить на закачку (см. метаданные/qBittorrent)");
    }
  };

  return (
    <div>
      <div className="add-field" style={{ marginTop: 4 }}>
        <input
          className="neu-in mc-input"
          placeholder="Поиск раздачи…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
        />
        <button className="btn btn-icon btn-accent" disabled={!q.trim() || searching} onClick={onSearch}>
          {searching ? "…" : "🔍"}
        </button>
      </div>

      {/* список раздач */}
      {results && !picked && (
        results.length === 0 ? (
          <div className="empty" style={{ marginTop: 10 }}>Раздачи не найдены.</div>
        ) : (
          <div className="sr-list">
            {results.map((r) => (
              <div key={r.guid} className="sr-row">
                <span className="sr-title" title={r.title}>{r.title}</span>
                <div className="sr-foot">
                  <span className="sr-meta">{fmtSize(r.size)} · <span className="sr-seeds">{r.seeders} seed</span> · {r.indexer}</span>
                  <button className="btn btn-sm btn-accent" disabled={!r.url} onClick={() => openTorrent(r)}>📂 Файлы</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* предпросмотр файлов выбранной раздачи */}
      {picked && (
        <div style={{ marginTop: 12 }}>
          <div className="add-field" style={{ alignItems: "center", marginBottom: 8 }}>
            <span className="sr-title" style={{ flex: 1 }} title={picked.title}>{picked.title}</span>
            <button className="btn btn-sm" onClick={() => { setPicked(null); setPreview(null); }}>← К списку</button>
          </div>

          {preview === "loading" ? (
            <div className="empty">Читаем файлы торрента…</div>
          ) : !preview ? (
            <div className="empty">Не удалось получить файлы.</div>
          ) : (
            <>
              {groupBySeason(preview.files.filter((f) => f.isVideo)).map((g) => (
                <div key={g.key} className="media-season">
                  <div className="media-season-head">
                    <span className="media-season-toggle" style={{ cursor: "default" }}>{g.label}</span>
                    <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{g.files.length} файл.</span>
                  </div>
                  <div className="media-ep-list">
                    {g.files.map((f) => (
                      <label key={f.fileIndex} className="imp-row">
                        <input type="checkbox" className="imp-check" checked={checked.has(f.fileIndex)} onChange={() => toggle(f.fileIndex)} />
                        <span className="media-ep-num mono">{epLabel(f)}</span>
                        <span className="imp-meta">
                          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{fmtSize(f.length)}</span>
                          <span className="imp-path" title={f.path}>{f.path.split("/").pop()}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {preview.files.filter((f) => f.isVideo).length === 0 && (
                <div className="empty">Видеофайлы не найдены в торренте.</div>
              )}
              <button className="btn btn-accent" style={{ width: "100%", marginTop: 14 }} disabled={grabbing || checked.size === 0} onClick={onGrab}>
                {grabbing ? "Ставим на закачку…" : `⬇ Скачать выбранное (${checked.size})`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ContentTorrents({ contentType, tmdbId, tvdbId, reloadKey }: { contentType: "movie" | "series"; tmdbId?: number | null; tvdbId?: number | null; reloadKey?: number }) {
  const toast = useToast();
  const [torrents, setTorrents] = useState<ContentTorrent[]>([]);
  const [addSel, setAddSel] = useState<Record<string, Set<number>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => getContentTorrents({ type: contentType, tmdbId, tvdbId }).then(setTorrents);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contentType, tmdbId, tvdbId, reloadKey]);

  const toggleAdd = (hash: string, idx: number) => setAddSel((p) => {
    const n = new Set(p[hash] ?? []); n.has(idx) ? n.delete(idx) : n.add(idx);
    return { ...p, [hash]: n };
  });

  const onMore = async (hash: string) => {
    const idxs = [...(addSel[hash] ?? [])];
    if (!idxs.length) return;
    setBusy(hash);
    const ok = await pickMoreFiles(hash, idxs);
    setBusy(null);
    if (ok) { toast.success(`Докачиваем ещё файлов: ${idxs.length}`); setAddSel((p) => ({ ...p, [hash]: new Set() })); load(); }
    else toast.error("Не удалось докачать");
  };

  if (torrents.length === 0) return null;

  return (
    <>
      {torrents.map((t) => {
        const sel = addSel[t.infohash] ?? new Set<number>();
        return (
          <div key={t.infohash} style={{ marginBottom: 14 }}>
            <div className="mediadetail-facts mono" style={{ marginBottom: 6 }} title={t.title}>📦 {t.title}</div>
            {groupBySeasonFiles(t.files).map((g) => (
              <div key={g.key} className="media-season">
                <div className="media-season-head">
                  <span className="media-season-toggle" style={{ cursor: "default" }}>{g.label}</span>
                </div>
                <div className="media-ep-list">
                  {g.files.map((f) => {
                    const label = f.seasonNumber != null && f.episodeNumber != null
                      ? `S${f.seasonNumber}E${f.episodeNumber}` : (f.path.split("/").pop() ?? f.path);
                    const pct = Math.round((f.progress ?? 0) * 100);
                    return (
                      <div key={f.fileIndex} className="imp-row">
                        {f.wanted ? (
                          <span className="imp-check" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Качается">{pct >= 100 ? "✓" : "↓"}</span>
                        ) : (
                          <input type="checkbox" className="imp-check" checked={sel.has(f.fileIndex)} onChange={() => toggleAdd(t.infohash, f.fileIndex)} title="Докачать" />
                        )}
                        <span className="media-ep-num mono">{label}</span>
                        <span className="imp-meta" style={{ alignItems: "center" }}>
                          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{fmtSize(f.length)}</span>
                          {f.wanted ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 90 }}>
                              <ProgressBar pct={pct} />
                              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{pct}%</span>
                            </span>
                          ) : (
                            <span className="imp-path">не качается</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {sel.size > 0 && (
              <button className="btn btn-sm btn-accent" style={{ marginTop: 8 }} disabled={busy === t.infohash} onClick={() => onMore(t.infohash)}>
                {busy === t.infohash ? "…" : `⬇ Докачать выбранное (${sel.size})`}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

// Группировка ContentTorrentFile по сезонам (для секции «уже качается»).
function groupBySeasonFiles(files: ContentTorrent["files"]) {
  const map = new Map<number, ContentTorrent["files"]>();
  for (const f of files) {
    const sn = f.seasonNumber ?? -1;
    if (!map.has(sn)) map.set(sn, []);
    map.get(sn)!.push(f);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sn, fs]) => ({
      key: sn,
      label: sn === -1 ? "Файлы" : sn === 0 ? "Спецвыпуски" : `Сезон ${sn}`,
      files: fs.sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)),
    }));
}
