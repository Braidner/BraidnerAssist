import { Card } from "../Card.tsx";
import { resources, services as mockServices } from "../../data/mock.ts";
import type { ServiceStatus } from "../../lib/api.ts";

const STAT_VAR: Record<"ok" | "warn" | "bad", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

interface Props {
  compact?: boolean;
  services?: ServiceStatus[];
  configured?: boolean;
}

export function SystemStatusPanel({ compact = true, services, configured }: Props) {
  const displayServices = configured && services ? services : mockServices;

  return (
    <Card
      icon="server"
      title="Статус системы"
      action={<span className="mono" style={{ fontSize: 11, color: "var(--ok)" }}>● Proxmox VM</span>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 18,
        }}
      >
        {resources.map((r) => (
          <div key={r.label} className="gauge">
            <div className="gauge-top">
              <span className="gauge-label">{r.label}</span>
              <span className="gauge-num">{r.num}</span>
            </div>
            <div className="bar"><i style={{ width: r.pct + "%" }} /></div>
          </div>
        ))}
      </div>
      <div>
        {displayServices.length === 0 && (
          <div className="empty" style={{ fontSize: 12 }}>
            Нет сервисов — создай /data/services.json
          </div>
        )}
        {displayServices.map((s) => (
          <div key={s.name} className="svc">
            <span
              className="svc-dot"
              style={{ background: STAT_VAR[s.status], color: STAT_VAR[s.status] }}
            />
            <span className="svc-name">{s.name}</span>
            <span className="svc-tag">{s.tag}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
