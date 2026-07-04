// System tab for MediaPage: download queue, active TorrServer streams.

import { useMemo } from "react";
import { DownloadCloud, Pause, Play, Plus, Trash2 } from "lucide-react";
import { Card } from "../../components/ui/Card.tsx";
import { MediaFileBrowser } from "./shared/MediaFileBrowser.tsx";
import {
  torrserverStreamUrl,
  posterUrl,
  type MediaData,
  type DownloadItem,
  type TorrServerStream,
} from "@/lib/api.ts";
import {
  ProgressBar,
  fmtSize,
  fmtSpeed,
  fmtEta,
} from "./shared/mediaShared.tsx";
import { useToast } from "../../components/ui/Toast.tsx";
import { cn } from "../../lib/cn.ts";
import { media as ms } from "./shared/mediaStyles.ts";

const SOURCE_LABEL: Record<DownloadItem["source"], string> = {
  qbittorrent: "qBittorrent",
};

function downloadKindLabel(download: DownloadItem): string {
  if (download.contentType === "movie") return "фильм";
  if (download.contentType === "series") return "сериал";
  return "загрузка";
}

function DownloadCard({
  download,
  busy,
  onTorrent,
}: {
  download: DownloadItem;
  busy: string | null;
  onTorrent: (hash: string, action: "pause" | "resume" | "delete") => void;
}) {
  const isQb = download.source === "qbittorrent";
  const paused = /paused|stopped/i.test(download.state);
  const meta = [
    SOURCE_LABEL[download.source],
    downloadKindLabel(download),
    download.mediaYear ? String(download.mediaYear) : "",
    paused ? "на паузе" : fmtSpeed(download.dlspeed),
    fmtEta(download.eta),
    download.seeds != null ? `${download.seeds} seed` : "",
    fmtSize(download.size),
  ].filter(Boolean).join(" · ");
  const badge = paused ? "pause" : `${download.progress}%`;
  const actionBusy = (action: string) => busy === download.hash + action;
  const artworkSrc = posterUrl(download.mediaPoster);
  const title = download.mediaTitle ?? download.title;
  const releaseTitle = download.mediaTitle ? download.title : null;

  return (
    <article className="group relative flex min-h-[230px] flex-col overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.03] transition-colors hover:border-white/[0.13] hover:bg-white/[0.045]">
      <div className="relative h-[116px] overflow-hidden bg-[#09090d]">
        {artworkSrc ? (
          <img
            src={artworkSrc}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover opacity-80 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(229,51,51,0.30),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.015)_42%,rgba(0,0,0,0.35))]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.76),transparent_70%)]" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-[10px] bg-black/35 text-white/78 backdrop-blur-md">
            <DownloadCloud className="size-4" strokeWidth={1.9} />
          </span>
          <span className="rounded-full bg-black/45 px-2 py-1 font-mono text-2xs text-white/70 backdrop-blur-md">
            {SOURCE_LABEL[download.source]}
          </span>
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-2xs font-semibold text-white backdrop-blur-md">
          {badge}
        </span>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/45">
          <div
            className="h-full bg-accent"
            style={{ width: `${Math.max(0, Math.min(100, download.progress))}%` }}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3.5">
        <div className="line-clamp-2 text-sm font-semibold leading-tight text-ink" title={title}>
          {title}
        </div>
        {releaseTitle && (
          <div className="line-clamp-2 font-mono text-2xs leading-relaxed text-muted" title={releaseTitle}>
            {releaseTitle}
          </div>
        )}
        {download.importPending && (
          <div
            className="w-fit cursor-help rounded-full bg-warn/15 px-2 py-0.5 font-mono text-2xs text-warn"
            title={download.importMessage}
          >
            не импортировано
          </div>
        )}
        <div className="mt-auto">
          <div className="mb-1.5 flex items-center gap-2">
            <ProgressBar pct={download.progress} />
            <span className="w-9 text-right font-mono text-2xs text-ink-soft">{download.progress}%</span>
          </div>
          <div className="line-clamp-2 min-h-[2rem] font-mono text-2xs leading-relaxed text-muted" title={meta || download.state}>
            {meta || download.state}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-2xs text-ink-soft" title={download.state}>
              {download.state}
            </span>
            {isQb && (
              <div className="flex flex-none gap-1.5">
                {paused ? (
                  <button
                    className={ms.button.iconSm}
                    title="Возобновить"
                    disabled={actionBusy("resume")}
                    onClick={() => onTorrent(download.hash, "resume")}
                  >
                    <Play className="size-3.5" fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className={ms.button.iconSm}
                    title="Пауза"
                    disabled={actionBusy("pause")}
                    onClick={() => onTorrent(download.hash, "pause")}
                  >
                    <Pause className="size-3.5" fill="currentColor" />
                  </button>
                )}
                <button
                  className={ms.button.iconSm}
                  title="Удалить"
                  disabled={actionBusy("delete")}
                  onClick={() => onTorrent(download.hash, "delete")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

interface MediaSystemTabProps {
  media: MediaData;
  tsStreams: TorrServerStream[];
  magnet: string;
  setMagnet: (v: string) => void;
  busy: string | null;
  onWatchNow: (url: string, title: string, key: string) => Promise<void>;
  onSetPlayer: (p: { url: string; title: string; direct: boolean }) => void;
  onTorrent: (hash: string, action: "pause" | "resume" | "delete") => void;
  onSetAddOpen: (v: boolean) => void;
  onRemoveStream: (hash: string) => void;
}

export function MediaSystemTab({
  media,
  tsStreams,
  magnet,
  setMagnet,
  busy,
  onWatchNow,
  onSetPlayer,
  onTorrent,
  onSetAddOpen,
  onRemoveStream,
}: MediaSystemTabProps) {
  const toast = useToast();
  const stableDownloads = useMemo(
    () => [...media.downloads].sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title, "ru");
      if (byTitle !== 0) return byTitle;
      return a.hash.localeCompare(b.hash);
    }),
    [media.downloads],
  );

  const playStream = (s: TorrServerStream) => {
    if (!s.file) {
      toast.error("Нет видеофайла в раздаче");
      return;
    }
    if (!s.file.playable)
      toast.info("Формат не для браузера — используй «Ссылка»/«.m3u»");
    onSetPlayer({
      url: torrserverStreamUrl(s.hash, s.file.index),
      title: s.title,
      direct: true,
    });
  };

  return (
    <div className={ms.pageMain}>
      {/* Смотреть онлайн через TorrServer — мгновенный стрим без полной загрузки */}
      {media.torrserver && (
        <Card
          icon="pulse"
          title="Смотреть онлайн"
          action={<span className={ms.panelCount}>{tsStreams.length}</span>}
        >
          <div className={cn(ms.field, "mt-1")}>
            <input
              className={ms.input}
              placeholder="magnet:… для мгновенного просмотра"
              value={magnet}
              onChange={(e) => setMagnet(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && magnet.trim()) {
                  onWatchNow(magnet.trim(), "Поток", "ts-magnet").then(() =>
                    setMagnet(""),
                  );
                }
              }}
            />
            <button
              className={ms.button.accentIcon}
              disabled={!magnet.trim() || busy === "ts-magnet"}
              title="Смотреть сейчас"
              onClick={() =>
                onWatchNow(magnet.trim(), "Поток", "ts-magnet").then(() =>
                  setMagnet(""),
                )
              }
            >
              {busy === "ts-magnet" ? "…" : "▶"}
            </button>
          </div>
          {tsStreams.length === 0 ? (
            <div className={cn(ms.empty, "mt-2.5")}>
              Нет активных потоков. Вставь magnet или жми «▶ Сейчас» в поиске.
            </div>
          ) : (
            <div className="mt-2.5 flex flex-col gap-2">
              {tsStreams.map((s) => (
                <div
                  key={s.hash}
                  className="flex items-center gap-2 rounded-[11px] border border-hair bg-surface px-2.5 py-2"
                >
                  <span
                    className="min-w-0 flex-1 truncate whitespace-nowrap text-cell text-ink"
                    title={s.file?.path ?? s.title}
                  >
                    {s.title}
                  </span>
                  <div className="flex flex-none gap-1">
                    <button
                      className={ms.button.iconSm}
                      title="Смотреть"
                      disabled={!s.file}
                      onClick={() => playStream(s)}
                    >
                      ▶
                    </button>
                    <button
                      className={ms.button.iconSm}
                      title="Остановить стрим"
                      disabled={busy === "tsrm" + s.hash}
                      onClick={() => onRemoveStream(s.hash)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Очередь загрузок + кнопка открытия дравера «Добавить» */}
      <Card
        icon="cloud"
        title="Загрузки"
        action={
          <div className="flex items-center gap-2">
            <span className={ms.panelCount}>{media.downloads.length}</span>
            <button
              className={ms.button.accentSm}
              onClick={() => onSetAddOpen(true)}
            >
              <Plus className="size-3.5" />
              Добавить
            </button>
          </div>
        }
      >
        {media.downloads.length === 0 ? (
          <div className={ms.empty}>
            Очередь пуста. Нажми «Добавить», чтобы найти и скачать.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {(() => {
              const totalSpeed = media.downloads.reduce(
                (s, d) => s + (d.dlspeed ?? 0),
                0,
              );
              const pending = media.downloads.filter(
                (d) => d.importPending,
              ).length;
              if (totalSpeed <= 0 && pending === 0) return null;
              return (
                <div className="flex items-center gap-3 px-0.5 pb-2 pt-0.5 font-mono text-pill text-muted">
                  {totalSpeed > 0 && <span>↓ {fmtSpeed(totalSpeed)}</span>}
                  {pending > 0 && (
                    <span className="text-warn">
                      ⚠ не импортировано: {pending}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {stableDownloads.map((download) => (
                <DownloadCard
                  key={download.hash}
                  download={download}
                  busy={busy}
                  onTorrent={onTorrent}
                />
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Файловый менеджер медиатеки (Media v2 — если задан MEDIA_ROOT) */}
      <MediaFileBrowser />
    </div>
  );
}
