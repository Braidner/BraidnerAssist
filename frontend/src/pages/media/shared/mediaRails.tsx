import type { ReactNode } from "react";
import { Bookmark, EyeOff, Play, Star } from "lucide-react";
import { cn } from "@/lib/cn.ts";
import type { ResumeItem } from "@/lib/api.ts";
import { media as ms } from "./mediaStyles.ts";

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
  const renderedCount = countLabel ?? (count != null ? `${count} тайтлов` : null);

  return (
    <section className={cn(ms.discSection, className)}>
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
      <div className={cn(ms.hTrack, ms.posterRow, ms.railInset)}>{children}</div>
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
