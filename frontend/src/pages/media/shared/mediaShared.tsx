// Общие медиа-компоненты и хелперы, переиспользуемые страницей /media и
// детальными страницами фильма/сериала: HLS-плеер, release picker и форматтеры.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Hls from "hls.js";
import { Check, Download, Search } from "lucide-react";
import {
  searchReleaseOptions,
  grabRelease,
  getReleaseSeasons,
  posterUrl,
  type DownloadItem,
  type ReleaseOption,
  type SeasonSummary,
  type TorrentRailItem,
} from "@/lib/api.ts";
import { getToken } from "@/lib/auth.ts";
import { useToast } from "@/components/ui/Toast.tsx";
import { cn } from "@/lib/utils.ts";
import { ui } from "@/lib/ui.ts";
import { media } from "./mediaStyles.ts";
import { MediaRail } from "./mediaRails.tsx";

type WebKitPresentationMode = "inline" | "fullscreen" | "picture-in-picture";
type WebKitVideoElement = HTMLVideoElement & {
  webkitPresentationMode?: WebKitPresentationMode;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitSupportsPresentationMode?: (mode: WebKitPresentationMode) => boolean;
  webkitSetPresentationMode?: (mode: WebKitPresentationMode) => void;
};

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

export function TorrentRailCard({ item, onOpen }: { item: TorrentRailItem; onOpen?: () => void }) {
  const meta = [
    item.kind === "series" ? "сериал" : "фильм",
    item.year ? String(item.year) : "",
    item.seasonNumber != null ? `сезон ${item.seasonNumber}` : "",
    item.indexer ?? "",
  ].filter(Boolean).join(" · ");
  const statusLabel =
    item.status === "in_library"
      ? "в Jellyfin"
      : item.status === "awaiting_jellyfin"
        ? "ждём Jellyfin"
        : fmtSpeed(item.dlspeed);
  const queue = [
    statusLabel,
    item.status === "downloading" ? fmtEta(item.eta) : "",
    item.seeders != null ? `${item.seeders} seed` : "",
    item.size != null ? fmtSize(item.size) : "",
  ].filter(Boolean).join(" · ");
  const badge =
    item.status === "in_library"
      ? "ok"
      : item.status === "awaiting_jellyfin"
        ? "scan"
        : `${item.progress}%`;

  return (
    <div
      className={cn(media.posterCard, "group", onOpen ? "cursor-pointer" : "cursor-default")}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={media.posterArt}>
        <div className="absolute inset-0 z-0 bg-[#09090d]" />
        {item.poster ? (
          <img
            src={posterUrl(item.poster)}
            alt=""
            loading="lazy"
            className="absolute inset-0 z-[1] size-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <div className="absolute inset-0 z-[2] bg-[linear-gradient(to_top,rgba(0,0,0,0.78)_0%,transparent_62%)]" />
        <span className={media.posterBadge}>{badge}</span>
        <div className="absolute bottom-0 left-0 right-0 z-[4] h-1 bg-black/40">
          <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
        </div>
      </div>
      <div className={media.posterInfo}>
        <div className={media.posterTitle}>{item.title}</div>
        <div className={media.posterSub}>{meta}</div>
        <div className="mt-2">
          <ProgressBar pct={item.progress} />
        </div>
        <div className={cn(media.posterSub, "mt-1 line-clamp-2")} title={item.releaseTitle}>
          {item.releaseTitle}
        </div>
        <div className={cn(media.posterSub, "mt-1")}>{queue || item.state}</div>
      </div>
    </div>
  );
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

function releaseChipClass(tone: "good" | "warn" | "muted" = "muted"): string {
  return cn(
    "whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-2xs leading-none",
    tone === "good" && "border-emerald-300/20 bg-emerald-400/12 text-emerald-100",
    tone === "warn" && "border-bad/25 bg-bad/14 text-bad",
    tone === "muted" && "border-white/10 bg-white/8 text-white/68",
  );
}

function releaseMatchChips(release: ReleaseOption): { label: string; tone: "good" | "warn" | "muted" }[] {
  const match = release.match;
  const parsed = release.parsed;
  const seeders = release.details?.stats?.seeders ?? release.seeders ?? 0;
  const chips: { label: string; tone: "good" | "warn" | "muted" }[] = [];
  if (match?.yearStatus === "match") {
    chips.push({ label: `год ${match.declaredYears.find((y) => match.allowedYears.includes(y)) ?? match.allowedYears[0]} ✓`, tone: "good" });
  } else if (match?.yearStatus === "mismatch") {
    chips.push({ label: `год ${match.declaredYears.join(", ")} ≠ ${match.allowedYears.join("/")}`, tone: "warn" });
  } else if (match?.allowedYears?.length) {
    chips.push({ label: `год ${match.allowedYears.join("/")}?`, tone: "muted" });
  }
  if (match?.seasonStatus === "match" && parsed?.season) chips.push({ label: `S${String(parsed.season).padStart(2, "0")} ✓`, tone: "good" });
  if (match?.seasonStatus === "mismatch" && parsed?.season) chips.push({ label: `не тот S${String(parsed.season).padStart(2, "0")}`, tone: "warn" });
  if (parsed?.resolution) chips.push({ label: `${parsed.resolution}p`, tone: "muted" });
  if (parsed?.source) chips.push({ label: parsed.source, tone: "muted" });
  const voice = releaseVoice(release);
  if (voice) chips.push({ label: voice, tone: "muted" });
  chips.push({ label: `${seeders} seed`, tone: seeders > 0 ? "good" : "warn" });
  for (const warning of [...(match?.warnings ?? []), ...(release.warnings ?? [])].slice(0, 2)) {
    const label = warning.includes("partial title") ? "частичное название" : warning;
    if (!chips.some((chip) => chip.label === label)) chips.push({ label, tone: "warn" });
  }
  return chips.slice(0, 7);
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
        "relative grid size-[34px] flex-none place-items-center overflow-hidden rounded-full border border-white/10 p-0 text-white shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur-md transition-[background,opacity,color,transform]",
        busy || realProgress != null ? "cursor-default bg-black/35 text-accent opacity-100" : "bg-black/35 opacity-85 hover:bg-accent hover:opacity-100",
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
  const videoRef = useRef<WebKitVideoElement>(null);
  const [vidPlaying, setVidPlaying] = useState(false);
  const [vidMuted, setVidMuted] = useState(false);
  const [vidDuration, setVidDuration] = useState(0);
  const [vidTime, setVidTime] = useState(0);
  const [vidBufferedPct, setVidBufferedPct] = useState(0);
  const [vidLoading, setVidLoading] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setVidBufferedPct(0);
    setVidLoading(Boolean(url));
    if (!url) { video.src = ""; video.load(); return; }
    let hls: Hls | null = null;
    let recoveryTimer: number | null = null;
    let recoveryAttempts = 0;
    const clearRecovery = (resetAttempts = false) => {
      if (recoveryTimer != null) window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
      if (resetAttempts) recoveryAttempts = 0;
    };
    const recoverPlayback = () => {
      recoveryTimer = null;
      if (video.paused || video.ended || recoveryAttempts >= 3) return;
      recoveryAttempts += 1;
      const resumeAt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      if (hls) {
        hls.startLoad(Math.max(0, resumeAt - 0.25));
        void playVideo(video);
      } else {
        const restorePosition = () => {
          if (resumeAt > 0 && Number.isFinite(video.duration)) {
            video.currentTime = Math.min(resumeAt, Math.max(0, video.duration - 0.1));
          }
          void playVideo(video);
        };
        video.addEventListener("loadedmetadata", restorePosition, { once: true });
        video.load();
      }
      if (recoveryAttempts < 3) {
        recoveryTimer = window.setTimeout(recoverPlayback, 6_000);
      }
    };
    const scheduleRecovery = () => {
      setVidLoading(true);
      if (recoveryTimer != null || recoveryAttempts >= 3) return;
      recoveryTimer = window.setTimeout(recoverPlayback, 6_000);
    };
    const markHealthy = () => clearRecovery(true);
    const stopRecovery = () => clearRecovery();
    video.addEventListener("waiting", scheduleRecovery);
    video.addEventListener("stalled", scheduleRecovery);
    video.addEventListener("playing", markHealthy);
    video.addEventListener("timeupdate", markHealthy);
    video.addEventListener("pause", stopRecovery);
    video.addEventListener("ended", stopRecovery);
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
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad(Math.max(0, video.currentTime - 0.25));
          scheduleRecovery();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          scheduleRecovery();
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      void playVideo(video);
    }
    return () => {
      clearRecovery();
      video.removeEventListener("waiting", scheduleRecovery);
      video.removeEventListener("stalled", scheduleRecovery);
      video.removeEventListener("playing", markHealthy);
      video.removeEventListener("timeupdate", markHealthy);
      video.removeEventListener("pause", stopRecovery);
      video.removeEventListener("ended", stopRecovery);
      hls?.destroy();
    };
  }, [url, direct]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const showLoading = () => setVidLoading(true);
    const hideLoading = () => setVidLoading(false);
    for (const event of ["loadstart", "waiting", "stalled", "seeking"] as const) {
      video.addEventListener(event, showLoading);
    }
    for (const event of ["canplay", "playing", "seeked", "error"] as const) {
      video.addEventListener(event, hideLoading);
    }
    return () => {
      for (const event of ["loadstart", "waiting", "stalled", "seeking"] as const) {
        video.removeEventListener(event, showLoading);
      }
      for (const event of ["canplay", "playing", "seeked", "error"] as const) {
        video.removeEventListener(event, hideLoading);
      }
    };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateBuffered = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0 || video.buffered.length === 0) {
        setVidBufferedPct(0);
        return;
      }
      let bufferedEnd = 0;
      for (let index = 0; index < video.buffered.length; index += 1) {
        const start = video.buffered.start(index);
        const end = video.buffered.end(index);
        if (video.currentTime >= start && video.currentTime <= end) {
          bufferedEnd = end;
          break;
        }
        if (end >= video.currentTime) bufferedEnd = Math.max(bufferedEnd, end);
      }
      setVidBufferedPct(Math.max(0, Math.min(100, (bufferedEnd / duration) * 100)));
    };
    const resetBuffered = () => setVidBufferedPct(0);
    video.addEventListener("progress", updateBuffered);
    video.addEventListener("durationchange", updateBuffered);
    video.addEventListener("loadedmetadata", updateBuffered);
    video.addEventListener("seeking", updateBuffered);
    video.addEventListener("emptied", resetBuffered);
    return () => {
      video.removeEventListener("progress", updateBuffered);
      video.removeEventListener("durationchange", updateBuffered);
      video.removeEventListener("loadedmetadata", updateBuffered);
      video.removeEventListener("seeking", updateBuffered);
      video.removeEventListener("emptied", resetBuffered);
    };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const supportsStandardPip =
      "pictureInPictureEnabled" in document &&
      Boolean(document.pictureInPictureEnabled) &&
      "requestPictureInPicture" in video;
    const supportsWebKitPip = Boolean(
      video.webkitSupportsPresentationMode?.("picture-in-picture"),
    );
    setPipSupported(supportsStandardPip || supportsWebKitPip);

    const handleEnter = () => setPipActive(true);
    const handleLeave = () => setPipActive(false);
    const handleWebKitPresentationMode = () => {
      setPipActive(video.webkitPresentationMode === "picture-in-picture");
    };
    video.addEventListener("enterpictureinpicture", handleEnter);
    video.addEventListener("leavepictureinpicture", handleLeave);
    video.addEventListener("webkitpresentationmodechanged", handleWebKitPresentationMode);
    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnter);
      video.removeEventListener("leavepictureinpicture", handleLeave);
      video.removeEventListener("webkitpresentationmodechanged", handleWebKitPresentationMode);
    };
  }, []);

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

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v || !pipSupported) return;
    const supportsWebKitPip = Boolean(v.webkitSupportsPresentationMode?.("picture-in-picture"));
    const useWebKitPip = () => {
      if (!supportsWebKitPip || !v.webkitSetPresentationMode) return false;
      const nextMode = v.webkitPresentationMode === "picture-in-picture"
        ? "inline"
        : "picture-in-picture";
      v.webkitSetPresentationMode(nextMode);
      setPipActive(nextMode === "picture-in-picture");
      return true;
    };

    if (supportsWebKitPip) {
      useWebKitPip();
      return;
    }

    if (document.pictureInPictureElement === v) {
      await document.exitPictureInPicture?.().catch(() => {});
      return;
    }

    if (v.webkitPresentationMode === "picture-in-picture") {
      useWebKitPip();
      return;
    }

    if ("requestPictureInPicture" in v && document.pictureInPictureEnabled) {
      await v.requestPictureInPicture?.().catch(() => {
        useWebKitPip();
      });
      return;
    }

    useWebKitPip();
  };

  const enterNativeFullscreen = () => {
    const v = videoRef.current;
    if (!v) return false;
    try {
      if (v.webkitSupportsPresentationMode?.("fullscreen") && v.webkitSetPresentationMode) {
        v.webkitSetPresentationMode("fullscreen");
        return true;
      }
      if (v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  return {
    videoRef,
    vidPlaying,
    setVidPlaying,
    vidMuted,
    setVidMuted,
    vidDuration,
    setVidDuration,
    vidTime,
    setVidTime,
    vidBufferedPct,
    vidLoading,
    togglePlay,
    toggleMute,
    seekTo,
    seekBy,
    pipSupported,
    pipActive,
    togglePiP,
    enterNativeFullscreen,
  };
}

// ── Интерактивный выбор раздачи (Jackett Torznab + native scoring) ─────
// Показывает релизы с постером, качеством, озвучкой, сидами и отправкой в qB.
export function TorrentCard({
  release,
  fallbackPosterSrc,
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
  fallbackPosterSrc?: string | null;
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
  const posterSrc = poster ? posterUrl(poster) : fallbackPosterSrc;
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
  const titleText = titleLines.length ? titleLines.join(" / ") : title;
  const meta = [
    tracker,
    quality,
    tech?.size ?? fmtSize(release.size),
    `${seeders} seed`,
  ].filter(Boolean).join(" · ");
  const status = download
    ? [download.state, download.dlspeed ? fmtSpeed(download.dlspeed) : "", download.eta ? fmtEta(download.eta) : ""]
      .filter(Boolean)
      .join(" · ")
    : null;
  const matchChips = releaseMatchChips(release);
  const blocked = Boolean(release.match?.block);
  const seasonBadge =
    release.inferredSeason != null ? `S${String(release.inferredSeason).padStart(2, "0")}` : null;

  return (
    <article
      className={cn(
        media.posterCard,
        "group scroll-ml-5",
        release.rejected && "opacity-70",
      )}
    >
      <div
        className={cn(
          media.posterArt,
          release.rejected && "ring-1 ring-bad/45",
        )}
      >
        <div className="absolute inset-0 z-0 grid place-items-center px-2 text-center font-mono text-2xs tracking-[0.1em] text-muted">
          NO ART
        </div>
        {posterSrc && (
          <img
            src={posterSrc}
            alt=""
            loading="lazy"
            className="absolute inset-0 z-[1] h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="absolute inset-0 z-[2] bg-[linear-gradient(to_top,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.16)_58%,transparent_100%)] transition-colors duration-700 group-hover:bg-[linear-gradient(to_top,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.28)_64%,transparent_100%)]" />

        <div className="absolute left-2 top-2 z-[4] flex max-w-[calc(100%-16px)] flex-wrap items-start gap-1.5 pr-10">
          <span className="max-w-full truncate rounded-full bg-black/70 px-2 py-1 font-mono text-2xs font-semibold leading-none text-white/80 backdrop-blur-md">
            {tracker}
          </span>
          {quality && (
            <span className="max-w-full truncate rounded-full bg-black/70 px-2 py-1 font-mono text-2xs font-semibold leading-none text-white/70 backdrop-blur-md">
              {quality}
            </span>
          )}
          {seasonBadge && (
            <span className="max-w-full truncate rounded-full bg-accent/85 px-2 py-1 font-mono text-2xs font-semibold leading-none text-accent-ink backdrop-blur-md">
              {seasonBadge}
            </span>
          )}
        </div>

        <div className="absolute right-2 top-2 z-[5]">
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
        <div className="absolute inset-x-0 bottom-0 z-[3] px-2.5 pb-2.5 pt-10">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="block max-h-[4.8em] overflow-hidden whitespace-normal break-words text-[12px] font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-colors hover:text-accent"
              title={title}
            >
              {titleText}
            </a>
          ) : (
            <div
              className="max-h-[4.8em] overflow-hidden whitespace-normal break-words text-[12px] font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              title={title}
            >
              {titleText}
            </div>
          )}
        </div>
      </div>

      <div className={media.posterInfo}>
        <div className={media.posterSub}>{meta}</div>
        {voiceTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {voiceTags.slice(0, 3).map((tag) => <span key={tag} className={voiceTagClass()}>{tag}</span>)}
          </div>
        )}
        {download && (
          <div className="mt-2">
            <ProgressBar pct={progress ?? 0} />
            {status && <div className={cn(media.posterSub, "mt-1")}>{status}</div>}
          </div>
        )}
        {extraMeta}
        {matchChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {matchChips.map((chip) => (
              <span key={`${chip.tone}:${chip.label}`} className={releaseChipClass(chip.tone)}>
                {chip.label}
              </span>
            ))}
          </div>
        )}
        {blocked && (
          <div className={cn(media.reject, "mt-2 whitespace-normal text-label")}>
            Релиз заблокирован: год или сезон не совпадает.
          </div>
        )}
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
  fallbackPosterSrc,
  downloads = [],
  showSeasonSelect = false,
}: {
  params: { type: "movie" | "series"; id: number; seasonNumber?: number };
  onGrabbed?: () => void;
  fallbackPosterSrc?: string | null;
  downloads?: DownloadItem[];
  showSeasonSelect?: boolean;
}) {
  const [releases, setReleases] = useState<ReleaseOption[] | null>(null);
  const [releaseQuery, setReleaseQuery] = useState("");
  const [debouncedReleaseQuery, setDebouncedReleaseQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyGuid, setBusyGuid] = useState<string | null>(null);
  const [grabbedHashes, setGrabbedHashes] = useState<Record<string, string>>({});
  const toast = useToast();
  const seasonSelectEnabled = showSeasonSelect && params.type === "series";
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [season, setSeason] = useState<number | undefined>(params.seasonNumber);
  const effectiveSeason = seasonSelectEnabled ? season : params.seasonNumber;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedReleaseQuery(releaseQuery.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [releaseQuery]);

  useEffect(() => {
    if (!seasonSelectEnabled) {
      setSeasons([]);
      return;
    }
    let alive = true;
    getReleaseSeasons("series", params.id).then((s) => {
      if (alive) setSeasons(s);
    });
    return () => {
      alive = false;
    };
  }, [seasonSelectEnabled, params.id]);

  useEffect(() => {
    let alive = true;
    setReleases(null);
    setError(null);
    setGrabbedHashes({});
    searchReleaseOptions({
      ...params,
      seasonNumber: effectiveSeason,
      query: debouncedReleaseQuery || undefined,
      limit: 50,
    }).then((r) => {
      if (!alive) return;
      setReleases(r.items);
      setError(r.error);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.type, params.id, effectiveSeason, debouncedReleaseQuery]);

  // Грабим один релиз и помечаем карточку как отправленную.
  const grabOne = async (r: ReleaseOption): Promise<{ ok: boolean; error: string | null }> => {
    const res = await grabRelease({
      type: params.type,
      id: params.id,
      guid: r.guid,
      indexerId: r.indexerId ?? r.indexer,
      seasonNumber: effectiveSeason,
    });
    if (res.ok) {
      if (res.infohash) setGrabbedHashes((p) => ({ ...p, [r.guid]: res.infohash! }));
    }
    return res;
  };

  const onGrab = async (r: ReleaseOption) => {
    let res: { ok: boolean; error: string | null } = { ok: false, error: null };
    try {
      setBusyGuid(r.guid);
      res = await grabOne(r);
    } finally {
      setBusyGuid(null);
    }
    if (res.ok) {
      toast.success("Раздача отправлена на загрузку");
      onGrabbed?.();
      window.setTimeout(() => onGrabbed?.(), 2_000);
      window.setTimeout(() => onGrabbed?.(), 5_000);
    } else toast.error(res.error ?? "Не удалось отправить раздачу");
  };
  const firstRelease = releases?.[0] ?? null;
  const bestRelease = releases?.find((release) => !release.match?.block && !release.rejected) ?? firstRelease;
  const bestBlocked = Boolean(bestRelease?.match?.block || bestRelease?.rejected);
  const seasonSelectEl: ReactNode | null =
    seasonSelectEnabled && seasons.length > 0 ? (
      <select
        className={media.select}
        value={season ?? ""}
        onChange={(e) => setSeason(e.target.value === "" ? undefined : Number(e.target.value))}
        aria-label="Сезон"
      >
        <option value="">Все сезоны</option>
        {seasons.map((s) => (
          <option key={s.seasonNumber} value={s.seasonNumber}>
            {s.airYear ? `Сезон ${s.seasonNumber} · ${s.airYear}` : `Сезон ${s.seasonNumber}`}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <div className="mt-3">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className={cn(media.input, "w-full pl-9")}
            value={releaseQuery}
            placeholder="Фильтр раздач: 1080p, WEB-DL, LostFilm"
            onChange={(event) => setReleaseQuery(event.target.value)}
          />
        </div>
      </div>

      {bestRelease && (
        <div data-impeccable-variants="a46d5efa" data-impeccable-variant-count="3" style={{ display: "contents" }}>
          {/* impeccable-variants-start a46d5efa */}
          {/* Original */}
          <div data-impeccable-variant="original">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/20 bg-accent/[0.06] px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-2xs uppercase tracking-4 text-accent/80">Лучший выбор</div>
                <div className="truncate text-sm font-semibold text-ink" title={bestRelease.details?.title ?? bestRelease.title}>
                  {bestRelease.details?.title ?? bestRelease.title}
                </div>
              </div>
              <button
                type="button"
                className={cn(media.button.accentSm, "flex-none")}
                disabled={bestBlocked || busyGuid === bestRelease.guid || Boolean(grabbedHashes[bestRelease.guid])}
                onClick={() => onGrab(bestRelease)}
              >
                <Download size={14} />
                {bestBlocked ? "Нужна проверка" : busyGuid === bestRelease.guid ? "Отправляем" : "Скачать лучший"}
              </button>
            </div>
          </div>
          {/* Variants: insert below this line */}
          <style data-impeccable-css="a46d5efa">{`
            @scope ([data-impeccable-variant="1"]) {
              :scope > .mc-bp { padding: 12px 16px; }
              :scope[data-p-density="roomy"] > .mc-bp { padding: 12px 16px; }
              :scope[data-p-density="comfy"] > .mc-bp { padding: 10px 14px; }
              :scope[data-p-density="cozy"] > .mc-bp { padding: 8px 12px; }
            }
            @scope ([data-impeccable-variant="2"]) {
              :scope > .mc-bp { padding: 12px; }
              :scope[data-p-density="roomy"] > .mc-bp { padding: 12px; }
              :scope[data-p-density="comfy"] > .mc-bp { padding: 10px; }
              :scope[data-p-density="cozy"] > .mc-bp { padding: 8px; }
            }
            @scope ([data-impeccable-variant="3"]) {
              :scope > .mc-bp { padding: 12px 16px; }
              :scope[data-p-density="roomy"] > .mc-bp { padding: 12px 16px; }
              :scope[data-p-density="comfy"] > .mc-bp { padding: 10px 14px; }
              :scope[data-p-density="cozy"] > .mc-bp { padding: 8px 12px; }
            }
          `}</style>
          {/* Variant 1 — roomy, chip-led (rhythm & spacing) */}
          <div data-impeccable-variant="1" data-impeccable-params='[{"id":"density","kind":"steps","default":"roomy","label":"Плотность","options":[{"value":"cozy","label":"Плотно"},{"value":"comfy","label":"Средне"},{"value":"roomy","label":"Просторно"}]}]'>
            <div className="mc-bp mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/[0.07]">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="flex-none text-accent"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" /></svg>
                  <span className="font-mono text-2xs uppercase tracking-4 text-accent">Лучший выбор</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {releaseMatchChips(bestRelease).map((c, i) => (
                    <span key={i} className={releaseChipClass(c.tone)}>{c.label}</span>
                  ))}
                </div>
                <div className="truncate text-2xs text-muted" title={bestRelease.details?.title ?? bestRelease.title}>{bestRelease.details?.title ?? bestRelease.title}</div>
              </div>
              <button
                type="button"
                className={cn(media.button.accentSm, "flex-none")}
                disabled={bestBlocked || busyGuid === bestRelease.guid || Boolean(grabbedHashes[bestRelease.guid])}
                onClick={() => onGrab(bestRelease)}
              >
                <Download size={14} />
                {bestBlocked ? "Нужна проверка" : busyGuid === bestRelease.guid ? "Отправляем" : "Скачать лучший"}
              </button>
            </div>
          </div>
          {/* Variant 2 — award-badge hierarchy (icon-led two-column) */}
          <div data-impeccable-variant="2" style={{ display: "none" }} data-impeccable-params='[{"id":"density","kind":"steps","default":"roomy","label":"Плотность","options":[{"value":"cozy","label":"Плотно"},{"value":"comfy","label":"Средне"},{"value":"roomy","label":"Просторно"}]}]'>
            <div className="mc-bp mb-3 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.06]">
              <div className="grid size-10 flex-none place-items-center rounded-lg bg-accent/15 text-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" /></svg>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="font-mono text-2xs uppercase tracking-4 text-accent/80">Лучший выбор</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {releaseMatchChips(bestRelease).map((c, i) => (
                    <span key={i} className={releaseChipClass(c.tone)}>{c.label}</span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className={cn(media.button.accentSm, "flex-none")}
                disabled={bestBlocked || busyGuid === bestRelease.guid || Boolean(grabbedHashes[bestRelease.guid])}
                onClick={() => onGrab(bestRelease)}
              >
                <Download size={14} />
                {bestBlocked ? "Нужна проверка" : busyGuid === bestRelease.guid ? "Отправляем" : "Скачать лучший"}
              </button>
            </div>
          </div>
          {/* Variant 3 — micro-details finish (card radius, pill badge, hover glow) */}
          <div data-impeccable-variant="3" style={{ display: "none" }} data-impeccable-params='[{"id":"density","kind":"steps","default":"roomy","label":"Плотность","options":[{"value":"cozy","label":"Плотно"},{"value":"comfy","label":"Средне"},{"value":"roomy","label":"Просторно"}]}]'>
            <div className="mc-bp group mb-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/25 bg-accent/[0.06] transition-shadow duration-200 hover:shadow-[var(--accent-glow-sm)]">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex flex-none items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 font-mono text-2xs uppercase tracking-3 text-accent">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" /></svg>
                    Лучший
                  </span>
                  <span className="truncate text-2xs text-muted" title={bestRelease.details?.title ?? bestRelease.title}>{bestRelease.details?.title ?? bestRelease.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {releaseMatchChips(bestRelease).map((c, i) => (
                    <span key={i} className={releaseChipClass(c.tone)}>{c.label}</span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className={cn(media.button.accentSm, "flex-none")}
                disabled={bestBlocked || busyGuid === bestRelease.guid || Boolean(grabbedHashes[bestRelease.guid])}
                onClick={() => onGrab(bestRelease)}
              >
                <Download size={14} />
                {bestBlocked ? "Нужна проверка" : busyGuid === bestRelease.guid ? "Отправляем" : "Скачать лучший"}
              </button>
            </div>
          </div>
          {/* impeccable-variants-end a46d5efa */}
        </div>
      )}

      {releases === null ? (
        <>
          {seasonSelectEl && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={media.discSecLabel}>Релизы</span>
              {seasonSelectEl}
            </div>
          )}
          <div className={media.empty}>Ищем раздачи…</div>
        </>
      ) : error ? (
        <>
          {seasonSelectEl && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={media.discSecLabel}>Релизы</span>
              {seasonSelectEl}
            </div>
          )}
          <div className={cn(media.empty, "text-bad")}>{error}</div>
        </>
      ) : releases.length === 0 ? (
        <>
          {seasonSelectEl && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={media.discSecLabel}>Релизы</span>
              {seasonSelectEl}
            </div>
          )}
          <div className={media.empty}>Раздачи не найдены.</div>
        </>
      ) : (
        <MediaRail
          title="Релизы"
          count={releases.length}
          countLabel={`${releases.length} раздач · по сидам`}
          headerActions={seasonSelectEl}
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
                fallbackPosterSrc={fallbackPosterSrc}
                busy={busyGuid === r.guid || pending}
                done={complete}
                disabled={busyGuid === r.guid || grabbed}
                download={download}
                onGrab={() => onGrab(r)}
              />
            );
          })}
        </MediaRail>
      )}
    </div>
  );
}
