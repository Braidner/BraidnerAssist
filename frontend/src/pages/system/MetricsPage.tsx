// Страница /metrics — история аптайма сервисов со спарклайнами и аптайм-%.

import { Card } from "../../components/ui/Card.tsx";
import { Placeholder } from "../../components/panels/Placeholder.tsx";
import type { UptimeSeries, UptimeSample } from "../../lib/api.ts";

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

// Инлайн-SVG спарклайн: точка = latencyMs, цвет по status.
function Sparkline({ samples }: { samples: UptimeSample[] }) {
  const W = 160;
  const H = 36;
  const n = samples.length;
  if (n === 0) return <svg width={W} height={H} />;

  const latencies = samples.map((s) => s.latencyMs ?? 0);
  const maxLat = Math.max(...latencies, 1);

  return (
    <svg width={W} height={H} style={{ display: "block", flexShrink: 0 }}>
      {samples.map((s, i) => {
        const x = (i / Math.max(n - 1, 1)) * (W - 4) + 2;
        const lat = s.latencyMs ?? 0;
        const y = H - 4 - (lat / maxLat) * (H - 8);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={2.5}
            fill={STATUS_COLOR[s.status] ?? "var(--muted)"}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

function UptimeBadge({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const color = value >= 99 ? "var(--ok)" : value >= 90 ? "var(--warn)" : "var(--bad)";
  return (
    <span
      className="neu-sm"
      style={{
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        color,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label} <span className="mono">{value}%</span>
    </span>
  );
}

export function MetricsPage({ metrics }: { metrics: UptimeSeries[] }) {
  return (
    <div className="page">
      <div className="page-cols">
        <div className="page-col-main">
          {metrics.length === 0 ? (
            <Placeholder
              icon="chart"
              title="Метрики"
              phase="Ещё нет истории — подождите первого цикла сэмплера"
            />
          ) : (
            <Card icon="chart" title="История аптайма">
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                {metrics.map((s) => (
                  <div
                    key={s.name}
                    className="neu-sm"
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Имя */}
                    <span style={{ fontWeight: 600, minWidth: 120 }}>{s.name}</span>

                    {/* Аптайм-бейджи */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <UptimeBadge label="24ч" value={s.uptime24h} />
                      <UptimeBadge label="7д" value={s.uptime7d} />
                    </div>

                    {/* Средняя латентность */}
                    {s.avgLatency !== null && (
                      <span className="mono" style={{ fontSize: 12, color: "var(--muted)", minWidth: 60 }}>
                        ⌀ {s.avgLatency}ms
                      </span>
                    )}

                    {/* Спарклайн */}
                    <div style={{ marginLeft: "auto" }}>
                      <Sparkline samples={s.samples} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
