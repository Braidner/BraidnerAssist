// Общие медиа-компоненты и хелперы, переиспользуемые страницей /media и
// детальными страницами фильма/сериала: HLS-плеер, release picker, ручной
// импорт застрявших раздач, форматтеры размеров/скорости/ETA.

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  searchReleaseOptions,
  grabRelease,
  getImportCandidates,
  executeImport,
  type DownloadItem,
  type ReleaseOption,
  type ManualImportFile,
} from "../../../lib/api.ts";
import { getToken } from "../../../lib/auth.ts";
import { useToast } from "../../../components/ui/Toast.tsx";
import { cn } from "../../../lib/cn.ts";
import { ui } from "../../../lib/ui.ts";
import { media } from "./mediaStyles.ts";

export function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "var(--ok)" : "var(--accent)";
  return (
    <div className={media.progress}>
      <div
        className={media.progressFill}
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: color,
        }}
      />
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
  url,
  title,
  onClose,
  direct = false,
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
      hls.on(
        Hls.Events.MANIFEST_PARSED,
        () => void video.play().catch(() => {}),
      );
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
    <div className={ui.overlay} onClick={onClose}>
      <div
        className="flex w-[min(880px,100%)] flex-col gap-2.5 rounded-card border border-hair bg-raise p-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm text-ink">{title}</span>
          {direct && (
            <div className="ml-auto mr-2 flex gap-1.5 max-[760px]:hidden">
              <button
                className={media.button.sm}
                onClick={copyLink}
                title="Скопировать прямую ссылку"
              >
                {copied ? "✓ Скопировано" : "🔗 Ссылка"}
              </button>
              <button
                className={media.button.sm}
                onClick={openM3u}
                title="Открыть в внешнем плеере (VLC/Kodi/TorrServe)"
              >
                📺 .m3u
              </button>
            </div>
          )}
          <button className={media.button.iconSm} onClick={onClose}>
            ✕
          </button>
        </div>
        <video
          ref={videoRef}
          controls
          autoPlay
          style={{ width: "100%", borderRadius: 12, background: "#000" }}
        />
        {direct && (
          <div className="mt-2 text-[11px] leading-snug text-muted">
            Если видео не играет (mkv/avi/HEVC) — нажми «Ссылка» или «.m3u» и
            открой в VLC/Kodi/приложении TorrServe на ТВ.
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
  params,
  onGrabbed,
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
    searchReleaseOptions(params).then((r) => {
      if (alive) setReleases(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.type, params.id, params.seasonNumber]);

  // Грабим один релиз; помечаем done. Возвращаем успех (для bulk-счётчика).
  const grabOne = async (r: ReleaseOption): Promise<boolean> => {
    const ok = await grabRelease({
      type: params.type,
      guid: r.guid,
      indexerId: r.indexerId,
    });
    if (ok) setDone((p) => ({ ...p, [r.guid]: true }));
    return ok;
  };

  const onGrab = async (r: ReleaseOption) => {
    setBusyGuid(r.guid);
    const ok = await grabOne(r);
    setBusyGuid(null);
    if (ok) {
      toast.success("Раздача отправлена на загрузку");
      onGrabbed?.();
    } else toast.error("Не удалось отправить раздачу");
  };

  const toggle = (guid: string) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(guid) ? n.delete(guid) : n.add(guid);
      return n;
    });

  const onBulk = async () => {
    if (!releases) return;
    setBulkBusy(true);
    let ok = 0,
      fail = 0;
    for (const r of releases.filter((x) => sel.has(x.guid) && !done[x.guid])) {
      (await grabOne(r)) ? ok++ : fail++;
    }
    setBulkBusy(false);
    setSel(new Set());
    if (ok) {
      toast.success(`Отправлено на загрузку: ${ok}`);
      onGrabbed?.();
    }
    if (fail) toast.error(`Не удалось отправить: ${fail}`);
  };

  if (releases === null)
    return <div className={cn(media.empty, "mt-2.5")}>Ищем раздачи…</div>;
  if (releases.length === 0)
    return <div className={cn(media.empty, "mt-2.5")}>Раздачи не найдены.</div>;

  const selCount = releases.filter(
    (x) => sel.has(x.guid) && !done[x.guid],
  ).length;

  return (
    <>
      <div className={media.list}>
        {releases.map((r) => (
          <div
            key={r.guid}
            className={cn(media.row, r.rejected && "border-bad/35")}
          >
            <label className="flex cursor-pointer items-start gap-[9px]">
              <input
                type="checkbox"
                className={media.checkbox}
                checked={sel.has(r.guid)}
                disabled={done[r.guid]}
                onChange={() => toggle(r.guid)}
              />
              <span className={cn(media.rowTitle, "flex-1")} title={r.title}>
                {r.title}
              </span>
            </label>
            <div className={cn(media.rowFoot, "flex-wrap gap-1.5")}>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted">
                <span className={media.badge}>{r.quality}</span>
                {r.languages.map((l) => (
                  <span key={l} className={media.lang}>
                    {l}
                  </span>
                ))}
                <span>{fmtSize(r.size)}</span>
                <span className={media.okText}>{r.seeders ?? 0} seed</span>
                <span>{r.indexer}</span>
                {r.rejected && (
                  <span
                    className={media.reject}
                    title={r.rejections.join("; ")}
                  >
                    ⚠ отклонён
                  </span>
                )}
              </span>
              <button
                className={media.button.accentSm}
                disabled={busyGuid === r.guid || done[r.guid] || bulkBusy}
                onClick={() => onGrab(r)}
              >
                {done[r.guid]
                  ? "✓ В очереди"
                  : busyGuid === r.guid
                    ? "…"
                    : "Скачать"}
              </button>
            </div>
            {done[r.guid] && /multi-season/i.test(r.rejections.join(" ")) && (
              <div className={cn(media.reject, "text-[10.5px]")}>
                Пак нескольких сезонов — после скачивания нажми «Импорт» в
                Загрузках, чтобы разложить серии.
              </div>
            )}
          </div>
        ))}
      </div>
      {selCount > 0 && (
        <button
          className={cn(media.button.accent, "mt-2.5 w-full")}
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
export function autoSelectFiles(
  files: ManualImportFile[],
  kind: "movie" | "series",
): Set<number> {
  const usable = files.filter((f) => {
    if (f.rejections.some((m) => /not an upgrade|already imported/i.test(m)))
      return false;
    return kind === "series" ? f.episodes.length > 0 : Boolean(f.movieTitle);
  });
  const best = new Map<string, ManualImportFile>();
  for (const f of usable) {
    const keys =
      kind === "series"
        ? f.episodes.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`)
        : [`movie-${f.movieTitle}`];
    for (const key of keys) {
      const prev = best.get(key);
      if (
        !prev ||
        f.rejections.length < prev.rejections.length ||
        (f.rejections.length === prev.rejections.length && f.size > prev.size)
      ) {
        best.set(key, f);
      }
    }
  }
  return new Set([...best.values()].map((f) => f.id));
}

// Дравер ручного импорта застрявшей раздачи: файлы по сезонам/сериям, флажки,
// предвыбран один файл на серию (дедуп копий с разной озвучкой), «Импорт».
export function ImportDrawer({
  item,
  onClose,
  onDone,
}: {
  item: DownloadItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const kind: "movie" | "series" =
    item.source === "radarr" ? "movie" : "series";
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: number) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const onImport = async () => {
    setBusy(true);
    const ok = await executeImport({
      type: kind,
      downloadId,
      fileIds: [...sel],
    });
    setBusy(false);
    if (ok) {
      toast.success(`Импортировано файлов: ${sel.size}`);
      onDone();
    } else toast.error("Импорт не удался");
  };

  // Группировка по сезонам (series) либо плоский список (movie).
  const groups = (() => {
    if (!files) return [];
    if (kind === "movie")
      return [{ key: -1, label: "Файлы", files }] as {
        key: number;
        label: string;
        files: ManualImportFile[];
      }[];
    const map = new Map<number, ManualImportFile[]>();
    for (const f of files) {
      const sn = f.episodes[0]?.seasonNumber ?? f.seasonNumber ?? 0;
      if (!map.has(sn)) map.set(sn, []);
      map.get(sn)!.push(f);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sn, fs]) => ({
        key: sn,
        label: sn === 0 ? "Спецвыпуски" : `Сезон ${sn}`,
        files: fs.sort(
          (a, b) =>
            (a.episodes[0]?.episodeNumber ?? 0) -
            (b.episodes[0]?.episodeNumber ?? 0),
        ),
      }));
  })();

  const fileLabel = (f: ManualImportFile) => {
    if (kind === "series" && f.episodes.length > 0) {
      const e = f.episodes[0];
      const range =
        f.episodes.length > 1
          ? `–E${f.episodes[f.episodes.length - 1].episodeNumber}`
          : "";
      return `S${e.seasonNumber}E${e.episodeNumber}${range}`;
    }
    return f.movieTitle ?? "—";
  };

  return (
    <>
      <div className={ui.overlay} onClick={onClose} />
      <aside className={ui.drawer}>
        <div className={ui.drawerInner}>
          <div className={ui.drawerHead}>
            <span className={ui.drawerKind}>Импорт: {item.title}</span>
            <button
              className={cn(ui.button.base, ui.button.iconSm)}
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {files === null ? (
            <div className={cn(media.empty, "mt-3")}>Сканируем файлы…</div>
          ) : files.length === 0 ? (
            <div className={cn(media.empty, "mt-3")}>
              Файлы для импорта не найдены.
            </div>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.key} className="mt-2.5 rounded-xl bg-surface">
                  <div className="flex items-center gap-2 px-2.5 py-2 max-[760px]:flex-wrap">
                    <span className="flex flex-1 cursor-default items-center justify-between gap-2 px-0.5 py-1 text-[13px] font-medium text-ink">
                      {g.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      {g.files.length} файл.
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 px-2.5 pb-2.5 pt-1">
                    {g.files.map((f) => (
                      <label
                        key={f.id}
                        className="flex cursor-pointer items-center gap-[9px] rounded-lg px-2 py-1.5 transition-colors hover:bg-hair"
                      >
                        <input
                          type="checkbox"
                          className={media.checkbox}
                          checked={sel.has(f.id)}
                          onChange={() => toggle(f.id)}
                        />
                        <span className="w-[26px] flex-none text-center font-mono text-[11px] text-muted">
                          {fileLabel(f)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <span className={media.badge}>{f.quality}</span>
                          {f.languages.map((l) => (
                            <span key={l} className={media.lang}>
                              {l}
                            </span>
                          ))}
                          <span className="font-mono text-[10px] text-muted">
                            {fmtSize(f.size)}
                          </span>
                          {f.rejections.length > 0 && (
                            <span
                              className={media.reject}
                              title={f.rejections.join("; ")}
                            >
                              ⚠
                            </span>
                          )}
                          <span
                            className="min-w-20 flex-1 truncate whitespace-nowrap font-mono text-[10px] text-muted"
                            title={f.relativePath}
                          >
                            {f.relativePath}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                className={cn(media.button.accent, "mt-4 w-full")}
                disabled={busy || sel.size === 0}
                onClick={onImport}
              >
                {busy
                  ? "Импортируем…"
                  : `Импортировать выбранное (${sel.size})`}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
