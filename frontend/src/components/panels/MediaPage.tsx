// Страница /media — что играет в Jellyfin + очередь загрузок Sonarr/Radarr/qBittorrent.

import { Card } from "../Card.tsx";
import { Placeholder } from "./Placeholder.tsx";
import type { MediaData, DownloadItem } from "../../lib/api.ts";

const SOURCE_LABEL: Record<DownloadItem["source"], string> = {
  sonarr: "Sonarr",
  radarr: "Radarr",
  qbittorrent: "qBittorrent",
};

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "var(--ok)" : "var(--accent)";
  return (
    <div className="neu-in" style={{ height: 6, borderRadius: 4, overflow: "hidden", flex: 1, minWidth: 80 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color }} />
    </div>
  );
}

export function MediaPage({ media }: { media: MediaData }) {
  if (!media.configured) {
    return (
      <div className="page">
        <div className="page-cols">
          <div className="page-col-main">
            <Placeholder icon="pulse" title="Медиа" phase="Медиа-стек не настроен (JELLYFIN/SONARR/RADARR/QBITTORRENT)" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-cols">
        <div className="page-col-main">
          {/* Что играет */}
          <Card
            icon="pulse"
            title="Сейчас играет"
            action={<span className="panel-count">{media.nowPlaying.length}</span>}
          >
            {media.nowPlaying.length === 0 ? (
              <div className="empty">Ничего не воспроизводится.</div>
            ) : (
              <div className="sys-vm-list" style={{ marginTop: 8 }}>
                {media.nowPlaying.map((np, i) => (
                  <div key={i} className="sys-vm-row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <span
                      className="dot-led"
                      style={{ background: "var(--accent)", boxShadow: "0 0 8px color-mix(in srgb, var(--accent) 70%, transparent)" }}
                    />
                    <span className="sys-vm-name" style={{ minWidth: 160 }}>{np.title}</span>
                    <span className="sys-vm-type mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {np.user} · {np.client}
                    </span>
                    {np.positionPct !== null && (
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 120, flex: 1 }}>
                        <ProgressBar pct={np.positionPct} />
                        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{np.positionPct}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="page-col-side">
          {/* Очередь загрузок */}
          <Card
            icon="cloud"
            title="Загрузки"
            action={<span className="panel-count">{media.downloads.length}</span>}
          >
            {media.downloads.length === 0 ? (
              <div className="empty">Очередь пуста.</div>
            ) : (
              <div className="sys-vm-list" style={{ marginTop: 8 }}>
                {media.downloads.map((d, i) => (
                  <div key={i} className="sys-vm-row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span className="sys-vm-name" style={{ minWidth: 140, flex: 1 }}>{d.title}</span>
                    <span className="sys-vm-type mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {SOURCE_LABEL[d.source]}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140, flex: 1 }}>
                      <ProgressBar pct={d.progress} />
                      <span className="mono" style={{ fontSize: 11, color: "var(--muted)", minWidth: 34, textAlign: "right" }}>
                        {d.progress}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
