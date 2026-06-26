// System tab for MediaPage: download queue, active TorrServer streams.

import { Card } from "../../components/ui/Card.tsx";
import { FileBrowser } from "../../components/panels/FileBrowser.tsx";
import {
  torrserverStreamUrl,
  type MediaData, type DownloadItem, type TorrServerStream,
} from "../../lib/api.ts";
import { ProgressBar, fmtSize, fmtSpeed, fmtEta } from "./shared/mediaShared.tsx";
import { useToast } from "../../components/ui/Toast.tsx";

const SOURCE_LABEL: Record<DownloadItem["source"], string> = {
  sonarr: "Sonarr",
  radarr: "Radarr",
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

  const playStream = (s: TorrServerStream) => {
    if (!s.file) { toast.error("Нет видеофайла в раздаче"); return; }
    if (!s.file.playable) toast.info("Формат не для браузера — используй «Ссылка»/«.m3u»");
    onSetPlayer({ url: torrserverStreamUrl(s.hash, s.file.index), title: s.title, direct: true });
  };

  return (
    <div className="page-col-main">
      {/* Смотреть онлайн через TorrServer — мгновенный стрим без полной загрузки */}
      {media.torrserver && (
        <Card icon="pulse" title="Смотреть онлайн" action={<span className="panel-count">{tsStreams.length}</span>}>
          <div className="add-field" style={{ marginTop: 4 }}>
            <input
              className="neu-in mc-input"
              placeholder="magnet:… для мгновенного просмотра"
              value={magnet}
              onChange={(e) => setMagnet(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && magnet.trim()) { onWatchNow(magnet.trim(), "Поток", "ts-magnet").then(() => setMagnet("")); } }}
            />
            <button
              className="btn btn-icon btn-accent"
              disabled={!magnet.trim() || busy === "ts-magnet"}
              title="Смотреть сейчас"
              onClick={() => onWatchNow(magnet.trim(), "Поток", "ts-magnet").then(() => setMagnet(""))}
            >
              {busy === "ts-magnet" ? "…" : "▶"}
            </button>
          </div>
          {tsStreams.length === 0 ? (
            <div className="empty" style={{ marginTop: 10 }}>Нет активных потоков. Вставь magnet или жми «▶ Сейчас» в поиске.</div>
          ) : (
            <div className="ts-list">
              {tsStreams.map((s) => (
                <div key={s.hash} className="ts-row">
                  <span className="ts-title" title={s.file?.path ?? s.title}>{s.title}</span>
                  <div className="ts-actions">
                    <button className="btn btn-icon btn-sm" title="Смотреть" disabled={!s.file} onClick={() => playStream(s)}>▶</button>
                    <button className="btn btn-icon btn-sm" title="Остановить стрим" disabled={busy === "tsrm" + s.hash} onClick={() => onRemoveStream(s.hash)}>🗑</button>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="panel-count">{media.downloads.length}</span>
            <button className="btn btn-sm btn-accent" onClick={() => onSetAddOpen(true)}>
              + Добавить
            </button>
          </div>
        }
      >
        {media.downloads.length === 0 ? (
          <div className="empty">Очередь пуста. Нажми «Добавить», чтобы найти и скачать.</div>
        ) : (
          <div className="dl-list">
            {(() => {
              const totalSpeed = media.downloads.reduce((s, d) => s + (d.dlspeed ?? 0), 0);
              const pending = media.downloads.filter((d) => d.importPending).length;
              if (totalSpeed <= 0 && pending === 0) return null;
              return (
                <div className="dl-summary mono">
                  {totalSpeed > 0 && <span>↓ {fmtSpeed(totalSpeed)}</span>}
                  {pending > 0 && <span className="dl-summary-warn">⚠ не импортировано: {pending}</span>}
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
              ].filter(Boolean).join(" · ");
              return (
                <div key={d.hash} className="dl-row">
                  <div className="dl-head">
                    <span className="dl-title" title={d.title}>{d.title}</span>
                    {d.importPending && (
                      <span className="dl-import-badge" title={d.importMessage}>⚠ не импортировано</span>
                    )}
                    <span className="dl-source">{SOURCE_LABEL[d.source]}</span>
                  </div>
                  <div className="dl-progress">
                    <ProgressBar pct={d.progress} />
                    <span className="dl-pct">{d.progress}%</span>
                  </div>
                  <div className="dl-foot">
                    <span className="dl-meta">{meta || "—"}</span>
                    <div className="dl-actions">
                      {!isQb && d.importPending && (
                        <button className="btn btn-sm btn-accent" title="Ручной импорт файлов" onClick={() => onSetImportFor(d)}>Импорт</button>
                      )}
                      {isQb && (
                        <>
                          {paused ? (
                            <button className="btn btn-icon btn-sm" title="Возобновить" disabled={busy === d.hash + "resume"} onClick={() => onTorrent(d.hash, "resume")}>▶</button>
                          ) : (
                            <button className="btn btn-icon btn-sm" title="Пауза" disabled={busy === d.hash + "pause"} onClick={() => onTorrent(d.hash, "pause")}>⏸</button>
                          )}
                          <button className="btn btn-icon btn-sm" title="Удалить" disabled={busy === d.hash + "delete"} onClick={() => onTorrent(d.hash, "delete")}>🗑</button>
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
