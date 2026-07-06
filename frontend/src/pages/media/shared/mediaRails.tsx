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

export function MediaPosterCardSkeleton() {
  return (
    <div className={ms.posterCard} aria-hidden="true">
      <div className={cn(ms.posterArt, "media-skeleton border border-white/[0.045]")} />
      <div className="media-skeleton mt-2 h-3 w-28 rounded" />
      <div className="media-skeleton mt-2 h-2 w-16 rounded" />
    </div>
  );
}

export function ContinueWatchingCardSkeleton() {
  return (
    <div className={ms.watchCard} aria-hidden="true">
      <div className={cn(ms.watchThumb, "media-skeleton border border-white/[0.045]")} />
      <div className="media-skeleton mt-2 h-3 w-36 rounded" />
      <div className="media-skeleton mt-2 h-2 w-24 rounded" />
    </div>
  );
}

export function MediaRailSkeletonStrip({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <MediaPosterCardSkeleton key={i} />
      ))}
    </>
  );
}

export function MediaDetailPageSkeleton({
  rows = 2,
  withHero = true,
}: {
  rows?: number;
  withHero?: boolean;
}) {
  return (
    <div className={ms.libPage} aria-busy="true">
      {withHero ? (
        <div className={cn(ms.libHero, "bg-[#09090d]")}>
          <div className="media-skeleton absolute inset-0" />
          <div className={ms.libHeroVignette} />
          <div className={ms.libHeroBody}>
            <div className="media-skeleton mb-4 h-3 w-36 rounded-full" />
            <div className="media-skeleton mb-4 h-16 w-[min(520px,82vw)] rounded-xl max-mob:h-12" />
            <div className="mb-5 flex flex-wrap gap-2">
              <div className="media-skeleton h-6 w-16 rounded-full" />
              <div className="media-skeleton h-6 w-24 rounded-full" />
              <div className="media-skeleton h-6 w-20 rounded-full" />
            </div>
            <div className="media-skeleton mb-3 h-3 w-[min(420px,72vw)] rounded" />
            <div className="media-skeleton mb-6 h-3 w-[min(340px,64vw)] rounded" />
            <div className="flex flex-wrap gap-3">
              <div className="media-skeleton h-12 w-32 rounded-[7px]" />
              <div className="media-skeleton h-12 w-28 rounded-[7px]" />
            </div>
          </div>
        </div>
      ) : null}
      {Array.from({ length: rows }).map((_, row) => (
        <section key={row} className={ms.discSection}>
          <div className={cn(ms.discSecHead, ms.railHeaderInset)}>
            <div className="media-skeleton h-6 w-36 rounded" />
            <div className={ms.discSecLine} />
            <div className="media-skeleton h-3 w-16 rounded" />
          </div>
          <div className={cn(ms.hTrack, ms.posterRow, ms.railInset)}>
            <MediaRailSkeletonStrip count={8} />
          </div>
        </section>
      ))}
    </div>
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
        {mounted ? visibleChildren : <MediaRailSkeletonStrip />}
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
  overlay,
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
  overlay?: ReactNode;
}) {
  const hasActions = Boolean(onHide || onWatchlist);
  const [imageLoading, setImageLoading] = useState(Boolean(imageUrl));

  useEffect(() => {
    setImageLoading(Boolean(imageUrl));
  }, [imageUrl]);

  return (
    <div className={cn(ms.posterCard, "group")} onClick={onClick}>
      <div className={ms.posterArt}>
        <div className="absolute inset-0 z-0 bg-[#09090d]" />
        {imageLoading ? <div className="media-skeleton absolute inset-0 z-[1]" /> : null}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className={cn(
              "absolute inset-0 z-[1] size-full object-cover transition-opacity duration-500",
              imageLoading ? "opacity-0" : "opacity-100",
            )}
            onLoad={() => setImageLoading(false)}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              setImageLoading(false);
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
        {overlay}
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
  const [imageLoading, setImageLoading] = useState(Boolean(imageUrl));

  useEffect(() => {
    setImageLoading(Boolean(imageUrl));
  }, [imageUrl]);

  return (
    <div className={cn(ms.watchCard, "group")} onClick={onClick}>
      <div className={ms.watchThumb}>
        {imageLoading ? <div className="media-skeleton absolute inset-0 z-[1]" /> : null}
        <div className="absolute inset-0">
          <img
            src={imageUrl}
            alt=""
            className={cn(
              "size-full object-cover transition-opacity duration-500",
              imageLoading ? "opacity-0" : "opacity-100",
            )}
            onLoad={() => setImageLoading(false)}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              setImageLoading(false);
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
