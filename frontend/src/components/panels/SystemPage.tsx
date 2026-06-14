import { useState } from "react";
import { Card } from "../Card.tsx";
import { Ring } from "../Ring.tsx";
import { Placeholder } from "./Placeholder.tsx";
import type { ProxmoxData, ServicesData, DockerData, DockerContainer, AdguardData } from "../../lib/api.ts";
import { dockerAction, getDocker } from "../../lib/api.ts";

const STAT_VAR: Record<"ok" | "warn" | "bad", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

function gb(bytes: number): number {
  return Math.round(bytes / 1024 ** 3);
}

function DockerCard({ docker, onRefresh }: { docker: DockerData; onRefresh: (d: DockerData) => void }) {
  const [pending, setPending] = useState<Record<string, boolean>>({});

  if (!docker.configured) {
    return <Placeholder icon="server" title="Docker" phase="DOCKER_SOCKET не задан" />;
  }

  const act = async (c: DockerContainer, action: string) => {
    // Оптимистичное обновление состояния
    const newState = action === "stop" ? "exited" : "running";
    onRefresh({
      ...docker,
      containers: docker.containers.map((x) =>
        x.id === c.id ? { ...x, state: newState, status: action === "stop" ? "Exited" : "Up" } : x,
      ),
    });
    setPending((p) => ({ ...p, [c.id]: true }));
    const ok = await dockerAction(c.id, action);
    setPending((p) => ({ ...p, [c.id]: false }));
    if (!ok) {
      // При ошибке рефетчим реальные данные
      getDocker().then(onRefresh);
    }
  };

  return (
    <Card
      icon="server"
      title="Docker"
      action={<span className="panel-count">{docker.containers.length} контейнеров</span>}
    >
      {docker.containers.length === 0 ? (
        <div className="empty">Нет контейнеров.</div>
      ) : (
        <div className="sys-vm-list" style={{ marginTop: 8 }}>
          {docker.containers.map((c) => {
            const running = c.state === "running";
            const color = running ? "var(--ok)" : "var(--muted)";
            const busy = Boolean(pending[c.id]);
            return (
              <div key={c.id} className="sys-vm-row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span
                  className="dot-led"
                  style={{
                    background: color,
                    boxShadow: running
                      ? `0 0 8px color-mix(in srgb, ${color} 70%, transparent)`
                      : "none",
                  }}
                />
                <span className="sys-vm-name" style={{ minWidth: 120 }}>{c.name}</span>
                <span className="sys-vm-type mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                  {c.state.toUpperCase()}
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {!running && (
                    <button
                      className="neu-sm"
                      disabled={busy}
                      style={{ padding: "2px 8px", fontSize: 11, cursor: busy ? "wait" : "pointer" }}
                      onClick={() => act(c, "start")}
                    >
                      Запустить
                    </button>
                  )}
                  {running && (
                    <button
                      className="neu-sm"
                      disabled={busy}
                      style={{ padding: "2px 8px", fontSize: 11, cursor: busy ? "wait" : "pointer" }}
                      onClick={() => act(c, "stop")}
                    >
                      Стоп
                    </button>
                  )}
                  <button
                    className="neu-sm"
                    disabled={busy}
                    style={{ padding: "2px 8px", fontSize: 11, cursor: busy ? "wait" : "pointer" }}
                    onClick={() => act(c, "restart")}
                  >
                    Рестарт
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AdguardCard({ adguard }: { adguard: AdguardData }) {
  if (!adguard.configured) {
    return <Placeholder icon="drop" title="AdGuard" phase="ADGUARD_URL не задан" />;
  }
  return (
    <Card
      icon="drop"
      title="AdGuard DNS"
      action={<span className="panel-count mono">{adguard.blockedPercent}% blocked</span>}
    >
      <div className="sys-gauges" style={{ marginTop: 4 }}>
        <div className="sys-gauge">
          <Ring pct={adguard.blockedPercent} size={96} />
          <div className="sys-gauge-lbl">
            <div className="sys-gauge-name">BLOCKED</div>
            <div className="sys-gauge-val mono">{adguard.blocked.toLocaleString("ru-RU")}</div>
          </div>
        </div>
        <div className="sys-gauge" style={{ justifyContent: "center" }}>
          <div className="sys-gauge-lbl">
            <div className="sys-gauge-name">ЗАПРОСЫ</div>
            <div className="sys-gauge-val mono">{adguard.dnsQueries.toLocaleString("ru-RU")}</div>
          </div>
        </div>
        <div className="sys-gauge" style={{ justifyContent: "center" }}>
          <div className="sys-gauge-lbl">
            <div className="sys-gauge-name">ЛАТЕНТНОСТЬ</div>
            <div className="sys-gauge-val mono">{adguard.avgProcessingMs}ms</div>
          </div>
        </div>
      </div>

      {adguard.topBlocked.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>Топ заблокированных</div>
          <div className="sys-svc-table">
            {adguard.topBlocked.map((d) => (
              <div key={d.domain} className="sys-svc-row">
                <span className="sys-svc-name">{d.domain}</span>
                <span className="sys-svc-tag mono" style={{ marginLeft: "auto" }}>{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// /system — развёрнутая страница: Proxmox-гейджи, VM/LXC, таблица сервисов, Docker, AdGuard.
export function SystemPage({
  proxmox,
  servicesData,
  docker,
  onDockerUpdate,
  adguard,
}: {
  proxmox: ProxmoxData;
  servicesData: ServicesData;
  docker: DockerData;
  onDockerUpdate: (d: DockerData) => void;
  adguard: AdguardData;
}) {
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

          {/* Docker */}
          <DockerCard docker={docker} onRefresh={onDockerUpdate} />

          {/* AdGuard DNS */}
          <AdguardCard adguard={adguard} />
        </div>
      </div>
    </div>
  );
}
