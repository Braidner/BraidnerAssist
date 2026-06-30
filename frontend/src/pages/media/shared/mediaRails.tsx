import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bookmark, EyeOff, Play, Star } from "lucide-react";
import { cn } from "@/lib/cn.ts";
import type { ResumeItem } from "@/lib/api.ts";
import { media as ms } from "./mediaStyles.ts";

const SHORT_RAIL_LIMIT = 12;
const DESKTOP_INITIAL_COUNT = 12;
const MOBILE_INITIAL_COUNT = 8;
const RAIL_BATCH_SIZE = 8;
const RAIL_PREFETCH_MARGIN = "900px 0px";
const RAIL_END_THRESHOLD_PX = 520;

function initialRailCount(total: number): number {
  if (total <= SHORT_RAIL_LIMIT) return total;
  if (typeof window === "undefined") return Math.min(DESKTOP_INITIAL_COUNT, total);
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  return Math.min(mobile ? MOBILE_INITIAL_COUNT : DESKTOP_INITIAL_COUNT, total);
}

function RailSkeletonStrip() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={ms.posterCard} aria-hidden="true">
          <div
            className={cn(
              ms.posterArt,
              "animate-[skel-pulse_1.4s_ease-in-out_infinite] border border-white/[0.045]",
            )}
          />
          <div className="mt-2 h-3 w-28 rounded bg-white/[0.045]" />
          <div className="mt-2 h-2 w-16 rounded bg-white/[0.035]" />
        </div>
      ))}
    </>
  );
}

export function MediaRail({
  title,
  count,
  countLabel,
  onTitleClick,
  children,
  className,
}: {
  title: string;
  count?: number;
  countLabel?: string;
  onTitleClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const childItems = useMemo(() => Children.toArray(children), [children]);
  const total = childItems.length;
  const [mounted, setMounted] = useState(total === 0);
  const [visibleCount, setVisibleCount] = useState(() => initialRailCount(total));
  const renderedCount = countLabel ?? (count != null ? `${count} тайтлов` : null);
  const visibleChildren = mounted ? childItems.slice(0, visibleCount) : [];

  useEffect(() => {
    setVisibleCount(initialRailCount(total));
    setMounted(total === 0);
  }, [total]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || mounted) return;
    if (!("IntersectionObserver" in window)) {
      setMounted(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: RAIL_PREFETCH_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  const growVisibleCount = useCallback(() => {
    setVisibleCount((current) => Math.min(total, current + RAIL_BATCH_SIZE));
  }, [total]);

  const maybeGrow = useCallback(() => {
    const track = trackRef.current;
    if (!track || visibleCount >= total) return;
    const distanceToEnd = track.scrollWidth - track.scrollLeft - track.clientWidth;
    if (distanceToEnd < RAIL_END_THRESHOLD_PX) growVisibleCount();
  }, [growVisibleCount, total, visibleCount]);

  useEffect(() => {
    if (!mounted) return;
    maybeGrow();
  }, [mounted, maybeGrow, visibleCount]);

  return (
    <section ref={sectionRef} className={cn(ms.discSection, className)}>
      <div className={cn(ms.discSecHead, ms.railHeaderInset)}>
        {onTitleClick ? (
          <button className={cn(ms.discSecLabel, ms.discSecLink)} onClick={onTitleClick}>
            {title}
          </button>
        ) : (
          <span className={ms.discSecLabel}>{title}</span>
        )}
        <div className={ms.discSecLine} />
        {renderedCount ? <span className={ms.discSecCount}>{renderedCount}</span> : null}
      </div>
      <div
        ref={trackRef}
        className={cn(ms.hTrack, ms.posterRow, ms.railInset)}
        onScroll={maybeGrow}
      >
        {mounted ? visibleChildren : <RailSkeletonStrip />}
      </div>
    </section>
  );
}

export function MediaPosterCard({
  title,
  subtitle,
  imageUrl,
  seasonCount,
  rank,
  rating,
  onClick,
  onHide,
  onWatchlist,
}: {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  seasonCount?: number | null;
  rank?: number;
  rating?: number | null;
  onClick: () => void;
  onHide?: () => void;
  onWatchlist?: () => void;
}) {
  const hasActions = Boolean(onHide || onWatchlist);

  return (
    <div className={cn(ms.posterCard, "group")} onClick={onClick}>
      <div className={ms.posterArt}>
        <div className="absolute inset-0 z-0 bg-[#09090d]" />
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 z-[1] size-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <div className="absolute inset-0 z-[2] bg-[linear-gradient(to_top,rgba(0,0,0,0.72)_0%,transparent_58%)]" />
        {seasonCount ? <span className={ms.posterBadge}>{seasonCount} сез.</span> : null}
        {rank != null ? <span className={ms.posterRankBadge}>{rank}</span> : null}
        {hasActions ? (
          <div className={ms.posterTopActions}>
            {onHide ? (
              <button
                type="button"
                className={ms.posterActionButton}
                title="Скрыть"
                aria-label="Скрыть"
                onClick={(e) => {
                  e.stopPropagation();
                  onHide();
                }}
              >
                <EyeOff size={16} strokeWidth={1.9} />
              </button>
            ) : (
              <span />
            )}
            {onWatchlist ? (
              <button
                type="button"
                className={ms.posterActionButton}
                title="В список"
                aria-label="В список"
                onClick={(e) => {
                  e.stopPropagation();
                  onWatchlist();
                }}
              >
                <Bookmark size={16} strokeWidth={1.9} />
              </button>
            ) : (
              <span />
            )}
          </div>
        ) : null}
        {rating != null ? (
          <div className={ms.posterRating}>
            <Star size={10} fill="#ffd700" strokeWidth={0} />
            {rating.toFixed(1)}
          </div>
        ) : null}
      </div>
      <div className={ms.posterInfo}>
        <div className={ms.posterTitle}>{title}</div>
        <div className={ms.posterSub}>{subtitle}</div>
      </div>
    </div>
  );
}

export function ContinueWatchingCard({
  item,
  imageUrl,
  onClick,
}: {
  item: ResumeItem;
  imageUrl: string;
  onClick: () => void;
}) {
  const colors = ["#cc3300", "#0077dd", "#00aaee", "#8833ff", "#ffaa00", "#00b8ae"];
  const accent = colors[item.title.charCodeAt(0) % colors.length];

  return (
    <div className={cn(ms.watchCard, "group")} onClick={onClick}>
      <div className={ms.watchThumb}>
        <div className="absolute inset-0">
          <img
            src={imageUrl}
            alt=""
            className="size-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className={ms.watchVignette} />
        <div className={ms.watchPlayLayer}>
          <div className={ms.roundPlay}>
            <Play size={22} fill="currentColor" strokeWidth={0} />
          </div>
        </div>
        <div className={ms.watchProg}>
          <div className="h-full" style={{ width: `${item.positionPct}%`, background: accent }} />
        </div>
      </div>
      <div className={ms.watchInfo}>
        <div className={ms.watchTitle}>{item.title}</div>
        <div className={ms.watchMeta}>
          {item.kind === "episode" ? <span className="text-white/40">эпизод · </span> : null}
          <span style={{ color: accent }}>{Math.round(item.positionPct)}% просмотрено</span>
        </div>
      </div>
    </div>
  );
}
