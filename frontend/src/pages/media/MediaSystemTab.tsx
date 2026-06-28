// System tab for MediaPage: download queue, active TorrServer streams.

import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card.tsx";
import { FileBrowser } from "../../components/panels/FileBrowser.tsx";
import {
  getMediaRepair,
  torrserverStreamUrl,
  type MediaData,
  type DownloadItem,
  type MediaRepairState,
  type TorrServerStream,
} from "../../lib/api.ts";
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
  sonarr: "Legacy TV",
  radarr: "Legacy Movie",
  qbittorrent: "qBittorrent",
};

interface MediaSystemTabProps {
  media: MediaData;
  tsStreams: TorrServerStream[];
  magnet: string;
  setMagnet: (v: string) => void;
  busy: string | null;
  onWatchNow: (url: string, title: string, key: string) => Promise<void>;
  onSetPlayer: (p: { url: string; title: string; direct: boolean }) => void;
  onSetImportFor: (d: DownloadItem) => void;
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
  onSetImportFor,
  onTorrent,
  onSetAddOpen,
  onRemoveStream,
}: MediaSystemTabProps) {
  const toast = useToast();
  const [repair, setRepair] = useState<MediaRepairState | null>(null);

  useEffect(() => {
    let alive = true;
    getMediaRepair().then((r) => {
      if (alive) setRepair(r);
    });
    const timer = window.setInterval(() => {
      getMediaRepair().then((r) => {
        if (alive) setRepair(r);
      });
    }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

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
      <Card
        icon="pulse"
        title="Native pipeline"
        action={<span className={ms.panelCount}>{repair ? repair.torrents.length + repair.missing.length : "…"}</span>}
      >
        {!repair ? (
          <div className={ms.empty}>Проверяем Jackett и импорт…</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
              {repair.jackett.map((j) => (
                <div key={j.id} className="rounded-xl border border-hair bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-cell text-ink" title={j.id}>{j.id}</span>
                    <span className={j.ok ? ms.okText : ms.reject}>{j.ok ? "ok" : "bad"}</span>
                  </div>
                  <div className="mt-1 font-mono text-2xs text-muted">
                    {j.latencyMs != null ? `${j.latencyMs}ms` : "—"} · {j.resultCount} test
                  </div>
                  {j.lastError && <div className={cn(ms.reject, "mt-1 line-clamp-2 text-label")} title={j.lastError}>{j.lastError}</div>}
                </div>
              ))}
            </div>
            {(repair.torrents.length > 0 || repair.missing.length > 0) ? (
              <div className="flex flex-col gap-2">
                {repair.torrents.slice(0, 4).map((t) => (
                  <div key={t.infohash} className="rounded-xl border border-hair bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-cell text-ink" title={t.title}>{t.title}</span>
                      <span className={t.importStatus === "failed" ? ms.reject : ms.badge}>{t.importStatus}</span>
                    </div>
                    {t.lastError && <div className={cn(ms.reject, "mt-1 text-label")} title={t.lastError}>{t.lastError}</div>}
                  </div>
                ))}
                {repair.missing.slice(0, 4).map((m) => (
                  <div key={`${m.monitorId}-${m.seasonNumber}-${m.episodeNumber}`} className="rounded-xl border border-hair bg-surface px-3 py-2 font-mono text-label text-muted">
                    missing · {m.title} S{m.seasonNumber}E{m.episodeNumber} · {m.status}
                  </div>
                ))}
              </div>
            ) : (
              <div className={ms.empty}>Repair Center чист: застрявших импортов и missing queue нет.</div>
            )}
          </div>
        )}
      </Card>

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
              + Добавить
            </button>
          </div>
        }
      >
        {media.downloads.length === 0 ? (
          <div className={ms.empty}>
            Очередь пуста. Нажми «Добавить», чтобы найти и скачать.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
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
            {media.downloads.map((d) => {
              const isQb = d.source === "qbittorrent";
              // qBittorrent 5.x: pausedDL/UP → stoppedDL/UP.
              const paused = /paused|stopped/i.test(d.state);
              const meta = [
                isQb && !paused ? fmtSpeed(d.dlspeed) : "",
                fmtEta(d.eta),
                d.seeds != null ? `${d.seeds} seed` : "",
                fmtSize(d.size),
                paused ? "на паузе" : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={d.hash}
                  className="flex flex-col gap-[9px] rounded-xl border border-hair bg-surface px-3.5 py-3"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="line-clamp-2 min-w-0 flex-1 text-body leading-[1.35] text-ink"
                      title={d.title}
                    >
                      {d.title}
                    </span>
                    {d.importPending && (
                      <span
                        className="cursor-help whitespace-nowrap rounded-full bg-warn/15 px-2 py-0.5 font-mono text-mini text-warn"
                        title={d.importMessage}
                      >
                        ⚠ не импортировано
                      </span>
                    )}
                    <span className="shrink-0 rounded-md bg-raise px-2 py-[3px] font-mono text-2xs text-ink-soft">
                      {SOURCE_LABEL[d.source]}
                    </span>
                  </div>
                  <div className="flex items-center gap-[9px]">
                    <ProgressBar pct={d.progress} />
                    <span className="min-w-9 text-right font-mono text-data text-ink-soft">
                      {d.progress}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className={ms.rowMeta}>{meta || "—"}</span>
                    <div className="flex shrink-0 gap-1.5">
                      {!isQb && d.importPending && (
                        <button
                          className={ms.button.accentSm}
                          title="Ручной импорт файлов"
                          onClick={() => onSetImportFor(d)}
                        >
                          Импорт
                        </button>
                      )}
                      {isQb && (
                        <>
                          {paused ? (
                            <button
                              className={ms.button.iconSm}
                              title="Возобновить"
                              disabled={busy === d.hash + "resume"}
                              onClick={() => onTorrent(d.hash, "resume")}
                            >
                              ▶
                            </button>
                          ) : (
                            <button
                              className={ms.button.iconSm}
                              title="Пауза"
                              disabled={busy === d.hash + "pause"}
                              onClick={() => onTorrent(d.hash, "pause")}
                            >
                              ⏸
                            </button>
                          )}
                          <button
                            className={ms.button.iconSm}
                            title="Удалить"
                            disabled={busy === d.hash + "delete"}
                            onClick={() => onTorrent(d.hash, "delete")}
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Файловый менеджер медиатеки (Media v2 — если задан MEDIA_ROOT) */}
      <FileBrowser />
    </div>
  );
}
