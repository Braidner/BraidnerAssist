import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  jellyfinBackdropUrl,
  jellyfinPosterUrl,
  posterUrl,
  type LibraryItem,
  type TmdbItem,
} from "@/lib/api.ts";
import { cn } from "@/lib/cn.ts";
import { media as ms } from "./mediaStyles.ts";
import { MediaPosterCard, MediaRail } from "./mediaRails.tsx";
import { fmtSize, useVideoPlayer } from "./mediaShared.tsx";

export type DetailPlayer = { url: string; title: string } | null;
export type QueueItem = { jellyfinId: string; title: string };
export type DetailHeroButtonVariant = "primary" | "secondary" | "active";

export function detailHeroButtonClass(variant: DetailHeroButtonVariant): string {
  return cn(
    "group inline-flex items-center justify-center gap-2 rounded-[7px] px-[22px] py-3 font-ui text-body font-bold tracking-2 transition-all duration-300 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
    "disabled:pointer-events-none disabled:opacity-55 max-mob:px-4 max-mob:py-2.5 max-mob:text-sm",
    variant === "primary" && [
      "border border-accent bg-accent px-[26px] text-white shadow-[0_0_28px_rgba(229,51,51,0.30)]",
      "hover:-translate-y-0.5 hover:brightness-[1.18] hover:shadow-[0_0_36px_rgba(229,51,51,0.40)] active:translate-y-0",
    ],
    variant === "secondary" && [
      "border border-white/30 bg-transparent text-white/90 backdrop-blur-md",
      "hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/[0.06] hover:text-white active:translate-y-0",
    ],
    variant === "active" && [
      "border border-white/24 bg-white/[0.035] text-white/72 backdrop-blur-md",
      "hover:-translate-y-0.5 hover:border-white/42 hover:bg-white/[0.065] hover:text-white active:translate-y-0",
    ],
  );
}

function fmtPlayerTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function DetailTopBar({
  title,
  onBack,
  onQueueClick,
}: {
  title: string;
  onBack: () => void;
  onQueueClick: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3.5 border-b border-white/[0.055] bg-page/90 px-8 py-3.5 backdrop-blur-xl max-mob:px-4 max-mob:py-3" style={{ animation: "detIn 0.3s 0s cubic-bezier(.22,.61,.36,1) both" }}>
      <button
        className="flex flex-none cursor-pointer items-center gap-[7px] border-none bg-transparent p-0 font-ui text-pill font-extrabold uppercase tracking-4 text-ink-soft transition-colors hover:text-accent"
        onClick={onBack}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>НАЗАД</span>
      </button>
      <span className="lmono flex-1 truncate text-center text-cell text-muted">{title}</span>
      <button
        className="flex flex-none cursor-pointer items-center gap-[7px] rounded-[7px] border border-white/12 bg-white/[0.04] px-3.5 py-[7px] font-ui text-pill font-bold tracking-1 text-white/60 transition-all hover:bg-white/[0.08] hover:text-ink"
        onClick={onQueueClick}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 3h14a1 1 0 011 1v17l-8-4-8 4V4a1 1 0 011-1z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        В очередь
      </button>
    </div>
  );
}

export function DetailBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        " px-[52px] max-mob:px-5 max-mob:pt-7 max-mob:pb-[60px]",
        className,
      )}
      style={{ animation: "detIn 0.38s 0.12s cubic-bezier(.22,.61,.36,1) both" }}
    >
      {children}
    </div>
  );
}

export function DetailStatusBadges({
  status,
  inMonitor: _inMonitor,
  monitorName: _monitorName,
  provider,
  file,
}: {
  status?: string | null;
  inMonitor: boolean;
  monitorName: string;
  provider?: string | null;
  file?: {
    hasFile: boolean;
    quality?: string | null;
    size?: number | null;
  };
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {status && <span className={ms.badge}>{status}</span>}
      {provider && <span className={ms.lang}>{provider}</span>}
      {file ? (
        file.hasFile ? (
          <span className={ms.badge}>
            {file.quality ?? "файл есть"}
            {file.size ? ` · ${fmtSize(file.size)}` : ""}
          </span>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-groove px-2 py-0.5 font-mono text-2xs text-muted">
            Файл отсутствует
          </span>
        )
      ) : null}
    </div>
  );
}

export function DetailHero({
  kindLabel,
  title,
  jellyfinId,
  backdropSrc,
  posterSrc,
  player,
  overview,
  year,
  runtimeLabel,
  rating,
  genres,
  actions,
  previousItem,
  nextItem,
  onBack,
  onQueueClick,
  onPlayQueueItem,
  onClosePlayer,
}: {
  kindLabel: string;
  title: string;
  jellyfinId: string;
  backdropSrc?: string;
  posterSrc?: string;
  player: DetailPlayer;
  overview?: string | null;
  year?: number | string | null;
  runtimeLabel?: string | null;
  rating?: number | null;
  genres?: string[];
  actions?: ReactNode;
  previousItem?: QueueItem | null;
  nextItem?: QueueItem | null;
  onBack: () => void;
  onQueueClick: () => void;
  onPlayQueueItem?: (item: QueueItem) => void;
  onClosePlayer: () => void;
}) {
  const heroRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const {
    videoRef,
    vidPlaying,
    setVidPlaying,
    vidMuted,
    setVidMuted,
    vidDuration,
    setVidDuration,
    vidTime,
    setVidTime,
    togglePlay,
    toggleMute,
    seekTo,
    seekBy,
  } = useVideoPlayer(player?.url ?? null);
  const displayTitle = player?.title ?? title;
  const heroBackdropSrc = backdropSrc ?? (jellyfinId ? jellyfinBackdropUrl(jellyfinId) : undefined);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (vidPlaying) {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2800);
    }
  }, [vidPlaying]);

  const stopPlayer = useCallback(() => {
    onClosePlayer();
    setControlsVisible(true);
    setSeekFeedback(null);
  }, [onClosePlayer]);

  const flashSeekFeedback = useCallback((label: string) => {
    setSeekFeedback(label);
    if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
  }, []);

  const playQueueItem = useCallback((item: QueueItem | null | undefined) => {
    if (!item || !onPlayQueueItem) return;
    onPlayQueueItem(item);
    revealControls();
  }, [onPlayQueueItem, revealControls]);

  const playNextItem = useCallback(() => {
    playQueueItem(nextItem);
  }, [nextItem, playQueueItem]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void heroRef.current?.requestFullscreen();
    }
    revealControls();
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!player) return;
      const target = e.target as HTMLElement | null;
      const isTextEntry = target?.closest(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (isTextEntry) return;

      if (e.key === "Escape") {
        stopPlayer();
        return;
      }
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        togglePlay();
        revealControls();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-15);
        flashSeekFeedback("-15s");
        revealControls();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(15);
        flashSeekFeedback("+15s");
        revealControls();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [flashSeekFeedback, player, revealControls, seekBy, stopPlayer, togglePlay]);

  useEffect(() => {
    if (!player) {
      setControlsVisible(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      return;
    }

    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (vidPlaying) {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2800);
    }

    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [player, vidPlaying]);

  useEffect(() => (
    () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (seekFeedbackTimerRef.current) clearTimeout(seekFeedbackTimerRef.current);
    }
  ), []);

  return (
    <div
      ref={heroRef}
      className="relative h-[56vh] min-h-[460px] overflow-hidden max-mob:h-[50vh] max-mob:min-h-[300px] fullscreen:h-screen fullscreen:min-h-screen fullscreen:w-screen"
      style={{ animation: "detIn 0.38s 0.06s cubic-bezier(.22,.61,.36,1) both" }}
      onMouseMove={player ? revealControls : undefined}
      onTouchStart={player ? revealControls : undefined}
    >
      <div className="absolute inset-0 bg-black">
        {heroBackdropSrc ? (
          <img
            src={heroBackdropSrc}
            alt=""
            className="absolute inset-0 size-full object-cover object-top"
            style={{ opacity: player ? 0 : 1, transition: "opacity 1.2s ease" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-cover"
          style={{ opacity: player ? 1 : 0, transition: "opacity 1.2s ease" }}
          onPlay={() => setVidPlaying(true)}
          onPause={() => setVidPlaying(false)}
          onVolumeChange={(e) => setVidMuted(e.currentTarget.muted)}
          onDurationChange={(e) => setVidDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setVidTime(e.currentTarget.currentTime)}
          onEnded={playNextItem}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23g)' opacity='0.1'/%3E%3C/svg%3E\")",
          backgroundSize: "180px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(9,9,13,0.72) 0%, rgba(9,9,13,0.32) 44%, rgba(9,9,13,0.06) 72%, transparent 100%), linear-gradient(to top, rgba(9,9,13,0.58) 0%, rgba(9,9,13,0.12) 28%, transparent 52%)",
        }}
      />

      <div
        className="absolute inset-x-0 top-0 z-[2] flex items-center justify-between gap-4 px-[52px] py-5 transition-all duration-500 ease-out max-mob:px-5 max-mob:py-4"
        style={{
          opacity: player && !controlsVisible ? 0 : 1,
          pointerEvents: player && !controlsVisible ? "none" : "auto",
          transform: player && !controlsVisible ? "translateY(-18px)" : "translateY(0)",
        }}
      >
        <button
          className="inline-flex h-11 flex-none cursor-pointer items-center gap-2 rounded-[9px] border border-white/10 bg-black/10 px-4 font-ui text-pill font-extrabold uppercase tracking-4 text-white/65 backdrop-blur-md transition-all hover:border-white/18 hover:bg-white/[0.07] hover:text-white"
          onClick={onBack}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M19 12H5M12 19l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Назад</span>
        </button>
        <button
          className="inline-flex h-11 flex-none cursor-pointer items-center gap-2 rounded-[9px] border border-white/12 bg-black/10 px-4 font-ui text-pill font-bold text-white/62 backdrop-blur-md transition-all hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
          onClick={onQueueClick}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 3h14a1 1 0 011 1v17l-8-4-8 4V4a1 1 0 011-1z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          <span>В очередь</span>
        </button>
      </div>

      <div
        className="relative z-[1] flex h-full items-end gap-9 px-[52px] pb-11 transition-all duration-500 ease-out max-mob:gap-[18px] max-mob:px-5 max-mob:pb-8"
        style={{
          opacity: player && !controlsVisible ? 0 : 1,
          pointerEvents: player && !controlsVisible ? "none" : "auto",
          transform: player && !controlsVisible ? "translateY(34px)" : "translateY(0)",
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="lmono mb-2.5 text-2xs uppercase tracking-6" style={{ color: player ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.38)", transition: "color 0.6s" }}>
            {player ? (vidPlaying ? "▶ ВОСПРОИЗВОДИТСЯ" : "⏸ ПАУЗА") : kindLabel}
          </div>
          <h1 className="m-0 mb-4 font-[Oswald,var(--font)] text-cinematic font-bold leading-[0.92] tracking-tight-hero text-white max-mob:text-cinematic-mob">{displayTitle}</h1>
          <div className="lmono mb-3.5 flex flex-wrap items-center gap-2 text-cell text-white/[0.48]">
            {year && <span>{year}</span>}
            {runtimeLabel && (
              <>
                <span className="text-white/20">·</span>
                <span>{runtimeLabel}</span>
              </>
            )}
            {rating && (
              <>
                <span className="text-white/20">·</span>
                <span>★ {rating.toFixed(1)}</span>
              </>
            )}
          </div>
          {overview && (
            <p
              className="m-0 mb-4 max-w-[720px] font-ui text-lead leading-[1.58] text-white/[0.68] line-clamp-3 transition-all duration-700 ease-out max-mob:text-body max-mob:leading-[1.5] max-mob:line-clamp-2"
              style={{
                maxHeight: player ? 0 : 132,
                opacity: player ? 0 : 1,
                transform: player ? "translateY(18px)" : "translateY(0)",
                overflow: "hidden",
              }}
            >
              {overview}
            </p>
          )}
          {genres && genres.length > 0 && (
            <div className="flex flex-wrap gap-[7px]">
              {genres.slice(0, 4).map((g) => (
                <span key={g} className="rounded-[4px] border border-white/[0.13] px-2.5 py-[3px] font-ui text-label font-bold uppercase tracking-genre text-white/[0.45]">{g}</span>
              ))}
            </div>
          )}
          {actions && (
            <div
              className="mb-4 pt-5 flex flex-wrap gap-3 overflow-hidden transition-all duration-700 ease-out"
              style={{
                maxHeight: player ? 0 : 96,
                opacity: player ? 0 : 1,
                transform: player ? "translateY(18px)" : "translateY(0)",
              }}
            >
              {actions}
            </div>
          )}
        </div>

        <div
          className="flex-none max-mob:hidden"
          style={{
            opacity: player ? 0.82 : 1,
            transform: player ? "translateY(-40px) scale(0.9)" : "none",
            transition: "opacity 1s ease, transform 1s cubic-bezier(.22,.61,.36,1)",
          }}
        >
          <div className="relative aspect-[2/3] w-[130px] overflow-hidden rounded-[11px] shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
            <div className="absolute inset-0 bg-[#09090d]" />
            {posterSrc ? (
              <img
                src={posterSrc}
                alt=""
                className="absolute inset-0 size-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {player && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/12 bg-black/45 px-5 py-3 font-ui text-lead-lg font-extrabold text-white shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300"
          style={{
            opacity: seekFeedback ? 1 : 0,
            transform: `translate(-50%, -50%) scale(${seekFeedback ? 1 : 0.94})`,
          }}
        >
          {seekFeedback}
        </div>
      )}

      {player && (
        <div
          className="media-player-controls absolute inset-x-0 bottom-0 z-10 px-[52px] pb-5 transition-all duration-500 ease-out max-mob:px-5"
          style={{
            opacity: controlsVisible ? 1 : 0,
            pointerEvents: controlsVisible ? "auto" : "none",
            transform: controlsVisible ? "translateY(0)" : "translateY(calc(100% + 24px))",
          }}
        >
          <div className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-black/35 px-3 py-2 text-white shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            {previousItem && onPlayQueueItem && (
              <button
                className="grid size-9 flex-none place-items-center rounded-full border border-white/15 bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
                onClick={() => playQueueItem(previousItem)}
                title={`Предыдущая серия: ${previousItem.title}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="11,12 20,5 20,19" />
                  <rect x="4" y="5" width="3" height="14" rx="1" />
                </svg>
              </button>
            )}
            <button
              className="grid size-9 flex-none place-items-center rounded-full border border-white/15 bg-white/12 text-white transition-all hover:bg-white/22"
              onClick={() => {
                togglePlay();
                revealControls();
              }}
              title={vidPlaying ? "Пауза" : "Воспроизвести"}
            >
              {vidPlaying ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6,3 21,12 6,21" />
                </svg>
              )}
            </button>
            {nextItem && onPlayQueueItem && (
              <button
                className="grid size-9 flex-none place-items-center rounded-full border border-white/15 bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
                onClick={() => playQueueItem(nextItem)}
                title={`Следующая серия: ${nextItem.title}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="13,12 4,5 4,19" />
                  <rect x="17" y="5" width="3" height="14" rx="1" />
                </svg>
              </button>
            )}
            <span className="w-[84px] flex-none font-mono text-2xs tabular-nums text-white/60">
              {fmtPlayerTime(vidTime)}
              {vidDuration > 0 ? ` / ${fmtPlayerTime(vidDuration)}` : ""}
            </span>
            <div
              className="h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/18"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seekTo((e.clientX - r.left) / r.width);
                revealControls();
              }}
            >
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: vidDuration > 0 ? `${(vidTime / vidDuration) * 100}%` : "0%" }} />
            </div>
            {nextItem && (
              <span
                className="hidden max-w-[220px] flex-none truncate font-ui text-pill font-bold text-white/45 min-[760px]:block"
                title={`Далее: ${nextItem.title}`}
              >
                Далее: {nextItem.title}
              </span>
            )}
            <button
              className="grid size-9 flex-none place-items-center rounded-full border border-white/15 bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
              onClick={() => {
                toggleMute();
                revealControls();
              }}
              title={vidMuted ? "Включить звук" : "Выключить звук"}
            >
              {vidMuted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="m19 9-6 6" />
                  <path d="m13 9 6 6" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )}
            </button>
            <button
              className="grid size-9 flex-none place-items-center rounded-full border border-white/15 bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
              onClick={toggleFullscreen}
              title="Во весь экран"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
                <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              </svg>
            </button>
            <button
              className="grid size-9 flex-none place-items-center rounded-full border border-white/15 bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
              onClick={stopPlayer}
              title="Остановить (Esc)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Нейтральная карточка рейла — обслуживает и Jellyfin-библиотеку, и TMDB-подборки.
export interface RailCard {
  key: string;
  title: string;
  sub: string;
  year: number | null;
  poster: string | undefined;
  seasonCount?: number | null;
  rating?: number | null;
  onClick: () => void;
}

// Адаптер: LibraryItem → RailCard (Jellyfin-постеры, навигация в карточку библиотеки).
export function libraryRailCards(
  items: LibraryItem[],
  onOpen: (item: LibraryItem) => void,
): RailCard[] {
  return items.map((item) => ({
    key: item.id,
    title: item.name,
    sub: item.type === "Series" ? "сериал" : "фильм",
    year: item.year,
    poster: jellyfinPosterUrl(item.id),
    seasonCount: item.childCount,
    rating: item.rating,
    onClick: () => onOpen(item),
  }));
}

// Адаптер: TmdbItem → RailCard (TMDB-постеры через прокси). onOpen ведёт в discover-карточку.
export function tmdbRailCards(
  items: TmdbItem[],
  onOpen: (item: TmdbItem) => void,
): RailCard[] {
  return items.map((item) => ({
    key: item.kind + item.tmdbId,
    title: item.title,
    sub: item.kind === "movie" ? "фильм" : "сериал",
    year: item.year,
    poster: posterUrl(item.poster),
    rating: item.rating,
    onClick: () => onOpen(item),
  }));
}

// Универсальный горизонтальный рейл (похожее / коллекция / любая подборка).
export function CardRail({ label, cards }: { label: string; cards: RailCard[] }) {
  if (cards.length === 0) return null;
  return (
    <MediaRail title={label} className="mt-8">
      {cards.map((c) => (
        <MediaPosterCard
          key={c.key}
          title={c.title}
          subtitle={`${c.sub}${c.year ? ` · ${c.year}` : ""}`}
          imageUrl={c.poster}
          seasonCount={c.seasonCount}
          rating={c.rating}
          onClick={c.onClick}
        />
      ))}
    </MediaRail>
  );
}

// Совместимость со старыми call-site'ами (библиотека). Тонкая обёртка над CardRail.
export function SimilarRail({
  items,
  onOpen,
  label = "ПОХОЖИЕ",
}: {
  items: LibraryItem[];
  onOpen?: (item: LibraryItem) => void;
  label?: string;
}) {
  const nav = useNavigate();
  const open =
    onOpen ??
    ((item: LibraryItem) =>
      nav(`/media/${item.type === "Series" ? "series" : "movie"}/${item.id}`));
  return <CardRail label={label} cards={libraryRailCards(items, open)} />;
}
