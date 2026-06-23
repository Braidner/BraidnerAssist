// Общие медиа-компоненты и хелперы, переиспользуемые страницей /media и
// детальными страницами фильма/сериала: HLS-плеер, release picker, ручной
// импорт застрявших раздач, форматтеры размеров/скорости/ETA.

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  searchReleaseOptions, grabRelease, getImportCandidates, executeImport,
  type DownloadItem, type ReleaseOption, type ManualImportFile,
} from "../../lib/api.ts";
import { getToken } from "../../lib/auth.ts";
import { useToast } from "../Toast.tsx";

export function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "var(--ok)" : "var(--accent)";
  return (
    <div className="neu-in" style={{ height: 6, borderRadius: 4, overflow: "hidden", flex: 1, minWidth: 80 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color }} />
    </div>
  );
}

export function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function fmtSpeed(bps?: number): string {
  if (!bps || bps <= 0) return "";
  const mb = bps / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${(bps / 1024).toFixed(0)} KB/s`;
}

export function fmtEta(eta?: number | null): string {
  if (eta == null || eta <= 0) return "";
  const h = Math.floor(eta / 3600);
  const m = Math.floor((eta % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

// ── Встроенный плеер: HLS (Jellyfin, hls.js) либо прямой файл (TorrServer) ──
// direct=true → <video src> с Range-стримом (TorrServer), без hls.js. Для
// несовместимых контейнеров (mkv/avi) показываем «копировать ссылку / .m3u».
export function Player({
  url, title, onClose, direct = false,
}: {
  url: string;
  title: string;
  onClose: () => void;
  direct?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const absUrl = url.startsWith("http") ? url : window.location.origin + url;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;

    if (direct) {
      // TorrServer отдаёт файл напрямую (Range/seek) — токен не нужен (роут вне jwtAuth).
      video.src = url;
      void video.play().catch(() => {});
    } else if (Hls.isSupported()) {
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
  }, [url, direct]);

  const copyLink = () => {
    void navigator.clipboard?.writeText(absUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const openM3u = () => {
    const playlist = `#EXTM3U\n#EXTINF:-1,${title}\n${absUrl}\n`;
    const blob = new Blob([playlist], { type: "audio/x-mpegurl" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w.-]+/g, "_").slice(0, 60) || "stream"}.m3u`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  };

  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="player-modal neu" onClick={(e) => e.stopPropagation()}>
        <div className="player-head">
          <span className="player-title">{title}</span>
          {direct && (
            <div className="player-ext">
              <button className="btn btn-sm" onClick={copyLink} title="Скопировать прямую ссылку">
                {copied ? "✓ Скопировано" : "🔗 Ссылка"}
              </button>
              <button className="btn btn-sm" onClick={openM3u} title="Открыть в внешнем плеере (VLC/Kodi/TorrServe)">
                📺 .m3u
              </button>
            </div>
          )}
          <button className="btn btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <video ref={videoRef} controls autoPlay style={{ width: "100%", borderRadius: 12, background: "#000" }} />
        {direct && (
          <div className="player-hint">
            Если видео не играет (mkv/avi/HEVC) — нажми «Ссылка» или «.m3u» и открой в VLC/Kodi/приложении TorrServe на ТВ.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Интерактивный выбор раздачи (Sonarr/Radarr /release) ──────────────
// Показывает релизы с качеством/озвучкой/сидами; отклонённые (multi-season
// и т.п.) выделены, но грабятся принудительно через force-grab.
export function ReleasePicker({
  params, onGrabbed,
}: {
  params: { type: "movie" | "series"; id: number; seasonNumber?: number };
  onGrabbed?: () => void;
}) {
  const [releases, setReleases] = useState<ReleaseOption[] | null>(null);
  const [busyGuid, setBusyGuid] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setReleases(null);
    setDone({});
    setSel(new Set());
    searchReleaseOptions(params).then((r) => { if (alive) setReleases(r); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.type, params.id, params.seasonNumber]);

  // Грабим один релиз; помечаем done. Возвращаем успех (для bulk-счётчика).
  const grabOne = async (r: ReleaseOption): Promise<boolean> => {
    const ok = await grabRelease({ type: params.type, guid: r.guid, indexerId: r.indexerId });
    if (ok) setDone((p) => ({ ...p, [r.guid]: true }));
    return ok;
  };

  const onGrab = async (r: ReleaseOption) => {
    setBusyGuid(r.guid);
    const ok = await grabOne(r);
    setBusyGuid(null);
    if (ok) { toast.success("Раздача отправлена на загрузку"); onGrabbed?.(); }
    else toast.error("Не удалось отправить раздачу");
  };

  const toggle = (guid: string) => setSel((p) => {
    const n = new Set(p);
    n.has(guid) ? n.delete(guid) : n.add(guid);
    return n;
  });

  const onBulk = async () => {
    if (!releases) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const r of releases.filter((x) => sel.has(x.guid) && !done[x.guid])) {
      (await grabOne(r)) ? ok++ : fail++;
    }
    setBulkBusy(false);
    setSel(new Set());
    if (ok) { toast.success(`Отправлено на загрузку: ${ok}`); onGrabbed?.(); }
    if (fail) toast.error(`Не удалось отправить: ${fail}`);
  };

  if (releases === null) return <div className="empty" style={{ marginTop: 10 }}>Ищем раздачи…</div>;
  if (releases.length === 0) return <div className="empty" style={{ marginTop: 10 }}>Раздачи не найдены.</div>;

  const selCount = releases.filter((x) => sel.has(x.guid) && !done[x.guid]).length;

  return (
    <>
      <div className="sr-list">
        {releases.map((r) => (
          <div key={r.guid} className={`sr-row ${r.rejected ? "rel-rejected" : ""}`}>
            <label className="sr-pick">
              <input
                type="checkbox"
                className="imp-check"
                checked={sel.has(r.guid)}
                disabled={done[r.guid]}
                onChange={() => toggle(r.guid)}
              />
              <span className="sr-title" title={r.title}>{r.title}</span>
            </label>
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
                disabled={busyGuid === r.guid || done[r.guid] || bulkBusy}
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
      {selCount > 0 && (
        <button
          className="btn btn-accent"
          style={{ width: "100%", marginTop: 10 }}
          disabled={bulkBusy}
          onClick={onBulk}
        >
          {bulkBusy ? "Отправляем…" : `⬇ Скачать выбранное (${selCount})`}
        </button>
      )}
    </>
  );
}

// Клиентский предвыбор: по одному лучшему файлу на серию/фильм (дедуп копий).
export function autoSelectFiles(files: ManualImportFile[], kind: "movie" | "series"): Set<number> {
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
export function ImportDrawer({
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
  const toast = useToast();

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
    if (ok) { toast.success(`Импортировано файлов: ${sel.size}`); onDone(); }
    else toast.error("Импорт не удался");
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
