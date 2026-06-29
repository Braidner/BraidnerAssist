// Общие медиа-компоненты и хелперы, переиспользуемые страницей /media и
// детальными страницами фильма/сериала: HLS-плеер, release picker, ручной
// импорт застрявших раздач, форматтеры размеров/скорости/ETA.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Hls from "hls.js";
import { Check, Download } from "lucide-react";
import {
  searchReleaseOptions,
  grabRelease,
  getImportCandidates,
  executeImport,
  posterUrl,
  type DownloadItem,
  type ReleaseOption,
  type ManualImportFile,
} from "@/lib/api.ts";
import { getToken } from "@/lib/auth.ts";
import { useToast } from "@/components/ui/Toast.tsx";
import { cn } from "@/lib/utils.ts";
import { ui } from "@/lib/ui.ts";
import { media } from "./mediaStyles.ts";
import { MediaRail } from "./mediaRails.tsx";

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

function releaseTracker(r: ReleaseOption): string {
  if ((r.trackerName === "all" || r.indexer === "all") && r.details?.provider) {
    return r.details.provider === "kinozal" ? "Kinozal" : r.details.provider;
  }
  return r.trackerName ?? r.indexer;
}

function releaseVoice(r: ReleaseOption): string | null {
  return r.voiceLabel ?? r.parsed?.voiceLabel ?? null;
}

function titleParts(title: string): string[] {
  return title.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
}

function releaseLink(r: ReleaseOption): string | null {
  const url = r.detailUrl ?? r.url ?? null;
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function voiceTagClass(): string {
  return "whitespace-nowrap rounded-full bg-warn/15 px-2 py-0.5 font-mono text-2xs text-warn";
}

function findReleaseDownload(
  downloads: DownloadItem[],
  grabbedHash?: string,
): DownloadItem | null {
  const hash = grabbedHash?.toLowerCase();
  if (!hash) return null;
  return downloads.find((d) => d.hash.toLowerCase() === hash || d.downloadId?.toLowerCase() === hash) ?? null;
}

function DownloadProgressButton({
  busy,
  done,
  progress,
  disabled,
  onClick,
}: {
  busy: boolean;
  done: boolean;
  progress?: number | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const [pendingProgress, setPendingProgress] = useState(0);
  const realProgress = progress != null ? Math.max(0, Math.min(100, progress)) / 100 : null;
  const visualProgress = realProgress ?? pendingProgress;

  useEffect(() => {
    if (!busy) {
      setPendingProgress(done ? 1 : 0);
      return;
    }
    let raf = 0;
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      setPendingProgress(Math.min(0.92, elapsed / 2600));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [busy, done]);

  const radius = 11;
  const circumference = 2 * Math.PI * radius;

  return (
    <button
      type="button"
      aria-label={done ? "Раздача в очереди" : "Скачать раздачу"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative grid size-[34px] flex-none place-items-center overflow-hidden rounded-full border-0 p-0 text-white transition-[background,opacity,color,transform]",
        busy || realProgress != null ? "cursor-default bg-transparent text-accent opacity-100" : "bg-white/[0.16] opacity-60 hover:bg-accent hover:opacity-100",
        done && "bg-ok/20 text-ok opacity-100",
        !busy && !done && realProgress == null && "hover:scale-105",
      )}
    >
      {busy || realProgress != null ? (
        <svg
          width="34"
          height="34"
          viewBox="0 0 34 34"
          fill="none"
          className="absolute inset-0 -rotate-90"
        >
          <circle cx="17" cy="17" r={radius} stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
          <circle
            cx="17"
            cy="17"
            r={radius}
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - visualProgress)}
            strokeLinecap="round"
          />
        </svg>
      ) : done ? (
        <Check size={16} strokeWidth={2.2} />
      ) : (
        <Download size={16} strokeWidth={2.2} />
      )}
      {realProgress != null && realProgress < 1 && (
        <span className="relative z-10 font-mono text-[9px] font-bold text-white">
          {Math.round(realProgress * 100)}
        </span>
      )}
    </button>
  );
}

async function playVideo(video: HTMLVideoElement) {
  try {
    video.muted = false;
    await video.play();
  } catch {
    video.muted = true;
    await video.play().catch(() => {});
  }
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
      void playVideo(video);
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
        () => void playVideo(video),
      );
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari: нативный HLS (кука/токен через тот же origin).
      video.src = url;
      void playVideo(video);
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
            <div className="ml-auto mr-2 flex gap-1.5 max-narrow:hidden">
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
          <div className="mt-2 text-data leading-snug text-muted">
            Если видео не играет (mkv/avi/HEVC) — нажми «Ссылка» или «.m3u» и
            открой в VLC/Kodi/приложении TorrServe на ТВ.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hook: manages HLS/direct video in a <video> ref ─────────────────────
export function useVideoPlayer(url: string | null, direct = false) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [vidPlaying, setVidPlaying] = useState(false);
  const [vidMuted, setVidMuted] = useState(false);
  const [vidDuration, setVidDuration] = useState(0);
  const [vidTime, setVidTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!url) { video.src = ""; video.load(); return; }
    let hls: Hls | null = null;
    if (direct) {
      video.src = url;
      void playVideo(video);
    } else if (Hls.isSupported()) {
      hls = new Hls({
        xhrSetup: (xhr) => {
          const token = getToken();
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        },
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => void playVideo(video));
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      void playVideo(video);
    }
    return () => { hls?.destroy(); };
  }, [url, direct]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play(); else v.pause();
  };

  const seekTo = (pct: number) => {
    const v = videoRef.current;
    if (!v || !vidDuration) return;
    v.currentTime = pct * vidDuration;
  };

  const seekBy = (deltaSeconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    const maxTime = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
    v.currentTime = Math.max(0, Math.min(maxTime, v.currentTime + deltaSeconds));
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setVidMuted(v.muted);
  };

  return { videoRef, vidPlaying, setVidPlaying, vidMuted, setVidMuted, vidDuration, setVidDuration, vidTime, setVidTime, togglePlay, toggleMute, seekTo, seekBy };
}

// ── Интерактивный выбор раздачи (Jackett Torznab + native scoring) ─────
// Показывает релизы с постером, качеством, озвучкой, сидами и отправкой в qB.
export function TorrentCard({
  release,
  busy,
  done,
  disabled,
  download,
  actionSlot,
  overlaySlot,
  extraMeta,
  onGrab,
}: {
  release: ReleaseOption;
  busy: boolean;
  done: boolean;
  disabled: boolean;
  download?: DownloadItem | null;
  actionSlot?: ReactNode;
  overlaySlot?: ReactNode;
  extraMeta?: ReactNode;
  onGrab: () => void;
}) {
  const details = release.details;
  const voice = releaseVoice(release);
  const tracker = releaseTracker(release);
  const poster = details?.posterRemote ?? release.posterRemote;
  const posterSrc = posterUrl(poster);
  const tech = details?.technical;
  const stats = details?.stats;
  const seeders = stats?.seeders ?? release.seeders ?? 0;
  const quality = tech?.quality ?? release.quality ?? (release.parsed?.resolution ? `${release.parsed.resolution}p` : null);
  const title = details?.title ?? release.title;
  const titleLines = titleParts(title);
  const voiceTags = tech?.voiceCodes?.length ? tech.voiceCodes : voice ? [voice] : [];
  const link = releaseLink(release);
  const progress = download?.progress;
  const isComplete = Boolean(done) || Boolean(download && progress != null && progress >= 100);
  const titleContent = (
    <div className="space-y-0.5 text-[11.5px] font-bold leading-[1.18] text-white [font-family:Syne,var(--font-ui)]" title={title}>
      {(titleLines.length ? titleLines : [title]).map((line, index) => (
        <div key={`${line}-${index}`} className="break-words">
          {line}
        </div>
      ))}
    </div>
  );

  return (
    <article
      className={cn(
        "group media-hover-card relative w-[220px] flex-none scroll-ml-5 max-mob:w-[calc(100vw-40px)]",
      )}
    >
      <div
        className={cn(
          "group relative aspect-[2/3.25] overflow-hidden rounded-[10px] bg-raise",
          release.rejected && "ring-1 ring-bad/40",
        )}
      >
        <div className="absolute inset-0 grid place-items-center px-2 text-center font-mono text-2xs tracking-[0.1em] text-muted">
          NO ART
        </div>
        {posterSrc && (
          <img
            src={posterSrc}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_38%,rgba(0,0,0,0.34)_72%,rgba(0,0,0,0.78)_100%),linear-gradient(to_top,rgba(0,0,0,0.97)_0%,rgba(0,0,0,0.7)_48%,rgba(0,0,0,0.16)_76%,rgba(0,0,0,0.18)_100%)]" />

        <div className="absolute left-2.5 top-2.5 flex max-w-[72%] flex-col items-start gap-1">
          <span className="whitespace-nowrap rounded bg-black/80 px-2 py-1 font-mono text-2xs font-bold text-white/90 shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md">
            {tracker}
          </span>
          {quality && (
            <span className="max-w-full truncate rounded bg-black/70 px-2 py-1 font-mono text-2xs font-semibold text-white/65 backdrop-blur-md">
              {quality}
            </span>
          )}
        </div>
        <div className="absolute right-2.5 top-2.5 rounded bg-black/60 px-2 py-1 font-mono text-2xs font-bold text-accent backdrop-blur-md">
          {seeders} сид
        </div>

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="block transition-opacity hover:opacity-80"
            >
              {titleContent}
            </a>
          ) : titleContent}

          <div className="mt-2 flex flex-wrap gap-1">
            {voiceTags.slice(0, 3).map((tag) => <span key={tag} className={voiceTagClass()}>{tag}</span>)}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[11.5px] font-semibold text-white/70">
              {tech?.size ?? fmtSize(release.size)}
            </span>
            {actionSlot ?? (
              <DownloadProgressButton
                busy={busy}
                done={isComplete}
                progress={progress}
                disabled={disabled || Boolean(download)}
                onClick={onGrab}
              />
            )}
          </div>
          {extraMeta}
          {download && (
            <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-white/58">
              <span className="truncate">{download.state}</span>
              {download.dlspeed ? <span>{fmtSpeed(download.dlspeed)}</span> : null}
              {download.eta ? <span>{fmtEta(download.eta)}</span> : null}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0">
        {done && /multi-season/i.test((release.rejections ?? []).join(" ")) && (
          <div className={cn(media.reject, "mt-2 whitespace-normal text-label")}>
            Пак нескольких сезонов — после скачивания нажми «Импорт» в Загрузках.
          </div>
        )}
      </div>
      {overlaySlot}
    </article>
  );
}

export function ReleasePicker({
  params,
  onGrabbed,
  downloads = [],
}: {
  params: { type: "movie" | "series"; id: number; seasonNumber?: number };
  onGrabbed?: () => void;
  downloads?: DownloadItem[];
}) {
  const [releases, setReleases] = useState<ReleaseOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyGuid, setBusyGuid] = useState<string | null>(null);
  const [grabbedHashes, setGrabbedHashes] = useState<Record<string, string>>({});
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setReleases(null);
    setError(null);
    setGrabbedHashes({});
    searchReleaseOptions(params).then((r) => {
      if (!alive) return;
      setReleases([...r.items].sort((a, b) => {
        const ak = releaseTracker(a).toLowerCase() === "kinozal" ? 0 : 1;
        const bk = releaseTracker(b).toLowerCase() === "kinozal" ? 0 : 1;
        return ak - bk;
      }));
      setError(r.error);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.type, params.id, params.seasonNumber]);

  // Грабим один релиз и помечаем карточку как отправленную.
  const grabOne = async (r: ReleaseOption): Promise<{ ok: boolean; error: string | null }> => {
    const res = await grabRelease({
      type: params.type,
      guid: r.guid,
      indexerId: r.indexerId ?? r.indexer,
    });
    if (res.ok) {
      if (res.infohash) setGrabbedHashes((p) => ({ ...p, [r.guid]: res.infohash! }));
    }
    return res;
  };

  const onGrab = async (r: ReleaseOption) => {
    setBusyGuid(r.guid);
    const res = await grabOne(r);
    setBusyGuid(null);
    if (res.ok) {
      toast.success("Раздача отправлена на загрузку");
      onGrabbed?.();
      window.setTimeout(() => onGrabbed?.(), 2_000);
      window.setTimeout(() => onGrabbed?.(), 5_000);
    } else toast.error(res.error ?? "Не удалось отправить раздачу");
  };

  if (releases === null)
    return <div className={cn(media.empty, "mt-2.5")}>Ищем раздачи…</div>;
  if (error)
    return <div className={cn(media.empty, "mt-2.5 text-bad")}>{error}</div>;
  if (releases.length === 0)
    return <div className={cn(media.empty, "mt-2.5")}>Раздачи не найдены.</div>;


  return (
    <MediaRail
      title="Релизы"
      count={releases.length}
      countLabel={`${releases.length} раздач`}
      className="mt-3"
    >
      {releases.map((r) => {
        const download = findReleaseDownload(downloads, grabbedHashes[r.guid]);
        const grabbed = Boolean(grabbedHashes[r.guid]);
        const pending = grabbed && !download;
        const complete = Boolean(download && download.progress >= 100);
        return (
          <TorrentCard
            key={r.guid}
            release={r}
            busy={busyGuid === r.guid || pending}
            done={complete}
            disabled={busyGuid === r.guid || grabbed}
            download={download}
            onGrab={() => onGrab(r)}
          />
        );
      })}
    </MediaRail>
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
    return kind === "series"
      ? (f.episodes?.length ?? f.episodeNumbers?.length ?? 0) > 0
      : Boolean(f.movieTitle ?? f.path);
  });
  const best = new Map<string, ManualImportFile>();
  for (const f of usable) {
    const keys =
      kind === "series"
        ? (f.episodes?.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`) ??
          f.episodeNumbers?.map((e) => `S${f.seasonNumber ?? 0}E${e}`) ??
          [])
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
  type,
  onClose,
  onDone,
}: {
  item: DownloadItem;
  type: "movie" | "series";
  onClose: () => void;
  onDone: () => void;
}) {
  const kind = type;
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
      const sn = f.episodes?.[0]?.seasonNumber ?? f.seasonNumber ?? 0;
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
            (a.episodes?.[0]?.episodeNumber ?? a.episodeNumbers?.[0] ?? 0) -
            (b.episodes?.[0]?.episodeNumber ?? b.episodeNumbers?.[0] ?? 0),
        ),
      }));
  })();

  const fileLabel = (f: ManualImportFile) => {
    const episodes = f.episodes ?? f.episodeNumbers?.map((episodeNumber) => ({
      id: episodeNumber,
      seasonNumber: f.seasonNumber ?? 0,
      episodeNumber,
      title: "",
    })) ?? [];
    if (kind === "series" && episodes.length > 0) {
      const e = episodes[0];
      const range =
        episodes.length > 1
          ? `–E${episodes[episodes.length - 1].episodeNumber}`
          : "";
      return `S${e.seasonNumber}E${e.episodeNumber}${range}`;
    }
    return f.movieTitle ?? f.path.split("/").pop() ?? "—";
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
                  <div className="flex items-center gap-2 px-2.5 py-2 max-narrow:flex-wrap">
                    <span className="flex flex-1 cursor-default items-center justify-between gap-2 px-0.5 py-1 text-body font-medium text-ink">
                      {g.label}
                    </span>
                    <span className="font-mono text-data text-muted">
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
                        <span className="w-[26px] flex-none text-center font-mono text-data text-muted">
                          {fileLabel(f)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <span className={media.badge}>{f.quality ?? "—"}</span>
                          {f.languages.map((l) => (
                            <span key={l} className={media.lang}>
                              {l}
                            </span>
                          ))}
                          <span className="font-mono text-2xs text-muted">
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
                            className="min-w-20 flex-1 truncate whitespace-nowrap font-mono text-2xs text-muted"
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
