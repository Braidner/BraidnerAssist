import { useEffect, useState } from "react";
import {
  Activity,
  ChevronDown,
  CircleGauge,
  Clock3,
  Eye,
  Link2Off,
  Monitor,
  Pause,
  Play,
  Radio,
  RefreshCw,
  UsersRound,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getJellyfinUserActivity,
  jellyfinPosterUrl,
  type JellyfinHistoryItem,
  type JellyfinNowPlaying,
  type JellyfinUserActivity,
  type JellyfinUserActivityData,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { ui } from "@/lib/ui";

const POLL_MS = 15_000;

export function UserActivityTab() {
  const [data, setData] = useState<JellyfinUserActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      setData(await getJellyfinUserActivity());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить активность");
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (!data && !error) return <ActivitySkeleton />;

  if (!data) {
    return (
      <section className={cn(ui.panel, "flex min-h-48 flex-col items-center justify-center text-center")}>
        <Activity className="size-6 text-bad" />
        <h2 className="mt-3 text-title font-semibold text-ink">Jellyfin не отвечает</h2>
        <p className="mt-1 max-w-md text-body text-ink-soft">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => load()}>
          <RefreshCw />
          Повторить
        </Button>
      </section>
    );
  }

  if (!data.configured) {
    return (
      <section className={cn(ui.panel, "flex min-h-48 flex-col items-center justify-center text-center")}>
        <Link2Off className="size-6 text-muted" />
        <h2 className="mt-3 text-title font-semibold text-ink">Jellyfin не настроен</h2>
        <p className="mt-1 max-w-md text-body text-ink-soft">
          Укажите JELLYFIN_URL и JELLYFIN_API_KEY, чтобы видеть онлайн и историю просмотров.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className={cn(ui.panel, "p-0")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-4">
          <div>
            <div className={ui.panelTitle}>
              <Activity className="size-4" />
              Активность Jellyfin
            </div>
            <p className="mt-1.5 text-cell text-ink-soft">
              Live bitrate текущих потоков · обновление каждые 15 секунд
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-label text-muted">
              {formatClock(data.updatedAt)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => load()}
            >
              <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
              Обновить
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-hair md:grid-cols-4 md:divide-y-0">
          <SummaryMetric
            icon={UsersRound}
            label="Профили"
            value={String(data.summary.users)}
          />
          <SummaryMetric
            icon={Wifi}
            label="Онлайн"
            value={`${data.summary.online} из ${data.summary.users}`}
            live={data.summary.online > 0}
          />
          <SummaryMetric
            icon={Eye}
            label="Смотрят сейчас"
            value={String(data.summary.watching)}
            live={data.summary.watching > 0}
          />
          <SummaryMetric
            icon={CircleGauge}
            label="Текущий поток"
            value={formatBitrate(data.summary.liveBitrate)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-body text-warn">
          Данные могли устареть: {error}
        </div>
      )}

      <div className={cn(ui.panel, "p-0")}>
        <div className="flex items-center justify-between gap-3 border-b border-hair px-5 py-4">
          <div className={ui.panelTitle}>
            <Radio className="size-4" />
            Пользователи
          </div>
          <span className={ui.panelCount}>
            {data.summary.watching ? `${data.summary.watching} смотрят` : "нет активных потоков"}
          </span>
        </div>

        {data.users.length ? (
          <div className="divide-y divide-hair">
            {data.users.map((user) => (
              <UserActivityRow key={user.id} user={user} />
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <UsersRound className="mx-auto size-6 text-muted" />
            <div className="mt-3 text-body font-semibold text-ink">Пользователей пока нет</div>
            <div className="mt-1 text-cell text-ink-soft">
              Создайте или привяжите пользователя Jellyfin в соседнем табе.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  live = false,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-5 py-4">
      <div
        className={cn(
          "grid size-9 flex-none place-items-center rounded-lg border border-hair bg-surface text-muted",
          live && "border-accent/25 bg-accent/10 text-accent",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="whitespace-nowrap font-mono text-[9px] uppercase tracking-1 text-muted md:text-label md:tracking-3">
          {label}
        </div>
        <div className="mt-0.5 truncate font-mono text-body font-semibold text-ink">{value}</div>
      </div>
    </div>
  );
}

function UserActivityRow({ user }: { user: JellyfinUserActivity }) {
  const [expanded, setExpanded] = useState(false);
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
  const recent = user.history.slice(0, 3);

  return (
    <article>
      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[210px_minmax(0,1fr)_130px]">
        <div className="flex min-w-0 gap-3">
          <div className="relative grid size-10 flex-none place-items-center rounded-xl border border-hair bg-surface font-mono text-cell font-semibold text-ink">
            {initials}
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-raise bg-muted",
                user.online && "bg-accent shadow-[var(--accent-glow-sm)]",
              )}
              aria-label={user.online ? "Онлайн" : "Офлайн"}
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-body font-semibold text-ink">{user.displayName}</div>
            <div className="mt-0.5 truncate text-cell text-ink-soft">@{user.username}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={user.online ? "accent" : "outline"}>
                {user.online ? "онлайн" : "офлайн"}
              </Badge>
              {user.role ? (
                <Badge variant="outline">{user.role === "admin" ? "админ" : "медиа"}</Badge>
              ) : (
                <Badge variant="warn">только Jellyfin</Badge>
              )}
              {!user.linked && user.appUserId && (
                <Badge variant="warn">не привязан</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          {user.nowPlaying.length ? (
            <div className="flex flex-col gap-3">
              {user.nowPlaying.map((playing) => (
                <NowPlayingRow key={playing.sessionId} playing={playing} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-16 items-center gap-3 text-ink-soft">
              <Clock3 className="size-4 flex-none text-muted" />
              <div className="min-w-0">
                <div className="text-body">
                  {user.online ? "В сети, ничего не смотрит" : "Сейчас не в сети"}
                </div>
                <div className="mt-1 truncate text-cell">
                  {user.online && user.devices.length
                    ? user.devices.map((device) => `${device.name} · ${device.client}`).join(", ")
                    : user.lastSeenAt
                      ? `Последняя активность ${formatRelativeTime(user.lastSeenAt)}`
                      : "Активности ещё не было"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 lg:flex-col lg:items-end">
          <div className="text-left lg:text-right">
            <div className="font-mono text-label uppercase tracking-3 text-muted">Трафик сейчас</div>
            <div className="mt-1 font-mono text-body font-semibold tabular-nums text-ink">
              {user.nowPlaying.length ? formatBitrate(user.liveBitrate) : "0 бит/с"}
            </div>
          </div>
          <div className="text-left text-cell text-ink-soft lg:text-right">
            {user.nowPlaying.length
              ? `${user.nowPlaying.length} ${pluralStream(user.nowPlaying.length)}`
              : recent.length
                ? `Последний просмотр ${formatRelativeTime(recent[0]!.playedAt)}`
                : "Нет просмотров"}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 border-t border-hair bg-groove/55 px-5 py-3 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent/60"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="min-w-0">
          <span className="font-mono text-label uppercase tracking-3 text-muted">
            Недавние просмотры
          </span>
          <span className="ml-3 text-cell text-ink-soft">
            {recent.length
              ? recent.map(historyTitle).join(" · ")
              : user.jellyfinUserId
                ? "история пока пуста"
                : "сначала привяжите Jellyfin"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 flex-none text-muted transition-transform duration-200 motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-hair bg-surface/45 px-5 py-2">
          {user.history.length ? (
            <div className="divide-y divide-hair">
              {user.history.map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-cell text-ink-soft">
              {user.jellyfinUserId
                ? "Jellyfin ещё не зафиксировал просмотры этого пользователя."
                : "У пользователя нет привязанного профиля Jellyfin."}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function NowPlayingRow({ playing }: { playing: JellyfinNowPlaying }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-xl border border-accent/20 bg-accent/6 p-3">
      <Poster imageItemId={playing.imageItemId} title={playing.seriesName ?? playing.name} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-cell text-accent">
              {playing.paused ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
              {playing.paused ? "Пауза" : "Смотрит сейчас"}
            </div>
            <div className="mt-1 truncate text-body font-semibold text-ink">
              {playing.seriesName ?? playing.name}
            </div>
            {playing.seriesName && (
              <div className="mt-0.5 truncate text-cell text-ink-soft">
                {episodeCode(playing)} · {playing.name}
              </div>
            )}
          </div>
          <Badge variant={playing.playMethod === "Transcode" ? "warn" : "outline"}>
            {playMethodLabel(playing.playMethod)}
          </Badge>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-faint">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${playing.progressPct ?? 0}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-cell text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <Monitor className="size-3.5 text-muted" />
            {playing.deviceName} · {playing.client}
          </span>
          {playing.progressPct != null && <span>{playing.progressPct}%</span>}
          {playing.resolution && <span>{playing.resolution}</span>}
          {playing.bitrate && <span>{formatBitrate(playing.bitrate)}</span>}
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ item }: { item: JellyfinHistoryItem }) {
  return (
    <div className="grid items-center gap-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_120px_110px]">
      <Poster imageItemId={item.imageItemId} title={item.seriesName ?? item.name} compact />
      <div className="min-w-0">
        <div className="truncate text-body font-medium text-ink">{historyTitle(item)}</div>
        {item.seriesName && (
          <div className="mt-0.5 truncate text-cell text-ink-soft">
            {episodeCode(item)} · {item.name}
          </div>
        )}
      </div>
      <div className="font-mono text-cell tabular-nums text-ink-soft">
        {item.played ? "просмотрено" : item.progressPct ? `${Math.round(item.progressPct)}%` : "запущено"}
      </div>
      <div className="text-left text-cell text-ink-soft sm:text-right">
        {formatRelativeTime(item.playedAt)}
      </div>
    </div>
  );
}

function Poster({
  imageItemId,
  title,
  compact = false,
}: {
  imageItemId: string;
  title: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const size = compact ? "h-11 w-8" : "h-16 w-11";
  return (
    <div className={cn("grid flex-none place-items-center overflow-hidden rounded-md bg-faint text-muted", size)}>
      {!failed ? (
        <img
          className="h-full w-full object-cover"
          src={jellyfinPosterUrl(imageItemId)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Play className="size-3.5" aria-label={title} />
      )}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <section className="flex flex-col gap-5" aria-label="Загрузка активности пользователей">
      <div className={cn(ui.panel, "p-5")}>
        <Skeleton className="h-5 w-48" />
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      </div>
      <div className={cn(ui.panel, "space-y-4")}>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    </section>
  );
}

function formatBitrate(bitsPerSecond: number): string {
  if (!bitsPerSecond) return "0 бит/с";
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
    })} Мбит/с`;
  }
  return `${Math.round(bitsPerSecond / 1_000).toLocaleString("ru-RU")} Кбит/с`;
}

function formatClock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 45) return "только что";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return new Date(timestamp).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function episodeCode(item: {
  seasonNumber: number | null;
  episodeNumber: number | null;
}): string {
  if (item.seasonNumber == null && item.episodeNumber == null) return "Эпизод";
  return `S${String(item.seasonNumber ?? 0).padStart(2, "0")}E${String(
    item.episodeNumber ?? 0,
  ).padStart(2, "0")}`;
}

function historyTitle(item: JellyfinHistoryItem): string {
  return item.seriesName ?? item.name;
}

function playMethodLabel(method: JellyfinNowPlaying["playMethod"]): string {
  if (method === "Transcode") return "транскод";
  if (method === "DirectStream") return "direct stream";
  return "direct play";
}

function pluralStream(count: number): string {
  return count === 1 ? "поток" : count >= 2 && count <= 4 ? "потока" : "потоков";
}
