import { Card } from "../Card.tsx";
import { Ring } from "../Ring.tsx";
import { Placeholder } from "./Placeholder.tsx";
import type { ProxmoxData, ServicesData } from "../../lib/api.ts";

const STAT_VAR: Record<"ok" | "warn" | "bad", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

function gb(bytes: number): number {
  return Math.round(bytes / 1024 ** 3);
}

// /system — развёрнутая страница: Proxmox-гейджи, VM/LXC, таблица сервисов.
export function SystemPage({ proxmox, servicesData }: { proxmox: ProxmoxData; servicesData: ServicesData }) {
  return (
    <div className="page">
      <div className="page-cols">
        <div className="page-col-main">
          {/* Proxmox нода */}
          {!proxmox.configured ? (
            <Placeholder icon="server" title="Proxmox" phase="Proxmox env не задан" />
          ) : proxmox.resource ? (
            <Card
              icon="server"
              title={`Proxmox · ${proxmox.node ?? "node"}`}
            >
              <div className="sys-gauges">
                <div className="sys-gauge">
                  <Ring pct={proxmox.resource.cpuPct} size={96} />
                  <div className="sys-gauge-lbl">
                    <div className="sys-gauge-name">CPU</div>
                    <div className="sys-gauge-val mono">{proxmox.resource.cpuPct}%</div>
                  </div>
                </div>
                <div className="sys-gauge">
                  <Ring pct={proxmox.resource.memPct} size={96} />
                  <div className="sys-gauge-lbl">
                    <div className="sys-gauge-name">RAM</div>
                    <div className="sys-gauge-val mono">
                      {gb(proxmox.resource.memUsed)}/{gb(proxmox.resource.memTotal)} ГБ
                    </div>
                  </div>
                </div>
                <div className="sys-gauge">
                  <Ring pct={proxmox.resource.diskPct} size={96} />
                  <div className="sys-gauge-lbl">
                    <div className="sys-gauge-name">DISK</div>
                    <div className="sys-gauge-val mono">
                      {gb(proxmox.resource.diskUsed)}/{gb(proxmox.resource.diskTotal)} ГБ
                    </div>
                  </div>
                </div>
              </div>

              {/* VM / LXC */}
              {proxmox.vms.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="panel-title" style={{ marginBottom: 12 }}>Виртуальные машины</div>
                  <div className="sys-vm-list">
                    {proxmox.vms.map((vm) => {
                      const running = vm.status === "running";
                      const color = running ? "var(--ok)" : "var(--muted)";
                      return (
                        <div key={`${vm.type}-${vm.vmid}`} className="sys-vm-row">
                          <span
                            className="dot-led"
                            style={{
                              background: color,
                              boxShadow: running
                                ? `0 0 8px color-mix(in srgb, ${color} 70%, transparent)`
                                : "none",
                            }}
                          />
                          <span className="sys-vm-name">{vm.name}</span>
                          <span className="sys-vm-type mono">{vm.type.toUpperCase()}</span>
                          {running ? (
                            <span className="sys-vm-stat mono">CPU {vm.cpuPct}% · RAM {vm.memPct}%</span>
                          ) : (
                            <span className="sys-vm-stat mono" style={{ color: "var(--muted)" }}>ОСТАНОВЛЕНА</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card icon="server" title="Proxmox">
              <div className="empty">Нода недоступна.</div>
            </Card>
          )}
        </div>

        <div className="page-col-side">
          {/* Сервисы */}
          {!servicesData.configured ? (
            <Placeholder icon="cloud" title="Сервисы" phase="services.json не найден" />
          ) : (
            <Card
              icon="cloud"
              title="Сервисы"
              action={<span className="panel-count">{servicesData.services.length} сервисов</span>}
            >
              {servicesData.services.length === 0 ? (
                <div className="empty">Нет сервисов для мониторинга.</div>
              ) : (
                <div className="sys-svc-table">
                  {servicesData.services.map((s) => (
                    <div key={s.name} className="sys-svc-row">
                      <span
                        className="dot-led"
                        style={{
                          background: STAT_VAR[s.status],
                          boxShadow: `0 0 8px color-mix(in srgb, ${STAT_VAR[s.status]} 70%, transparent)`,
                        }}
                      />
                      <span className="sys-svc-name">{s.name}</span>
                      <span className="sys-svc-tag mono">{s.tag}</span>
                      <span className="sys-svc-st mono" style={{ color: STAT_VAR[s.status] }}>
                        {s.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
