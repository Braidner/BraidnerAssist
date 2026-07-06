import { CheckCircle2, Clock3, DownloadCloud, Heart, Loader2 } from "lucide-react";
import { cn } from "../../../lib/cn.ts";
import type { MediaTitleStatus } from "@/lib/api.ts";

const STATUS_TONE: Record<MediaTitleStatus["status"], string> = {
  watchlist: "border-sky-300/20 bg-sky-400/12 text-sky-100",
  registered: "border-white/12 bg-white/8 text-white/72",
  release_selected: "border-amber-300/20 bg-amber-400/12 text-amber-100",
  downloading: "border-accent/25 bg-accent/14 text-white",
  awaiting_jellyfin: "border-violet-300/20 bg-violet-400/12 text-violet-100",
  in_library: "border-emerald-300/20 bg-emerald-400/12 text-emerald-100",
  watched: "border-emerald-300/20 bg-emerald-400/12 text-emerald-100",
};

function StatusIcon({ status }: { status: MediaTitleStatus["status"] }) {
  if (status === "watchlist") return <Heart className="size-3" />;
  if (status === "downloading") return <Loader2 className="size-3 animate-spin" />;
  if (status === "in_library" || status === "watched") return <CheckCircle2 className="size-3" />;
  if (status === "awaiting_jellyfin") return <Clock3 className="size-3" />;
  return <DownloadCloud className="size-3" />;
}

export function MediaStatusBadge({
  status,
  className,
}: {
  status?: MediaTitleStatus | null;
  className?: string;
}) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-2xs font-semibold leading-none backdrop-blur-md",
        STATUS_TONE[status.status],
        className,
      )}
      title={status.label}
    >
      <StatusIcon status={status.status} />
      <span className="truncate">{status.label}</span>
    </span>
  );
}

export function statusKey(kind: "movie" | "series", tmdbId?: number | null): string | null {
  return tmdbId ? `${kind}:${tmdbId}` : null;
}
