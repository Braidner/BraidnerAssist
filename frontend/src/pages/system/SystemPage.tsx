import { useState, useEffect } from "react";
import { Card } from "../../components/ui/Card.tsx";
import { Ring } from "../../components/ui/Ring.tsx";
import { Placeholder } from "../../components/panels/Placeholder.tsx";
import { BackendLogsCard } from "./BackendLogsCard.tsx";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";
import type {
  ProxmoxData,
  ServicesData,
  DockerData,
  DockerContainer,
  AdguardData,
  PosterCacheStatus,
} from "../../lib/api.ts";
import {
  clearPosterCache,
  dockerAction,
  getDocker,
  getAdguard,
  getPosterCacheStatus,
  getProxmox,
  getServices,
} from "../../lib/api.ts";

const STAT_VAR: Record<"ok" | "warn" | "bad", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

function gb(bytes: number): number {
  return Math.round(bytes / 1024 ** 3);
}

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

const statList = "flex flex-col gap-0";
const statRow =
  "grid grid-cols-[12px_1fr_auto_auto] items-center gap-2.5 border-t border-hair py-2 text-body";
const statName = "min-w-0 truncate text-row font-medium text-ink";
const statTag = "font-mono text-data text-muted";
const gaugeRow = "flex flex-wrap gap-7 px-0 pb-1 pt-2";
const gaugeItem = "flex items-center gap-3.5";
const gaugeLabel = "flex flex-col gap-1";
const gaugeName = "font-mono text-2xs uppercase tracking-3 text-muted";
const gaugeValue = "font-mono text-body font-bold text-ink";
const statusDot = "size-2.5 rounded-full";

function DockerCard({
  docker,
  onRefresh,
}: {
  docker: DockerData;
  onRefresh: (d: DockerData) => void;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});

  if (!docker.configured) {
    return (
      <Placeholder
        icon="server"
        title="Docker"
        phase="DOCKER_SOCKET не задан"
      />
    );
  }

  const act = async (c: DockerContainer, action: string) => {
    // Оптимистичное обновление состояния
    const newState = action === "stop" ? "exited" : "running";
    onRefresh({
      ...docker,
      containers: docker.containers.map((x) =>
        x.id === c.id
          ? {
              ...x,
              state: newState,
              status: action === "stop" ? "Exited" : "Up",
            }
          : x,
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
      action={
        <span className={ui.panelCount}>
          {docker.containers.length} контейнеров
        </span>
      }
    >
      {docker.containers.length === 0 ? (
        <div className="py-2.5 font-mono text-xs text-muted">
          Нет контейнеров.
        </div>
      ) : (
        <div className={cn(statList, "mt-2")}>
          {docker.containers.map((c) => {
            const running = c.state === "running";
            const color = running ? "var(--ok)" : "var(--muted)";
            const busy = Boolean(pending[c.id]);
            return (
              <div key={c.id} className={statRow}>
                <span
                  className={statusDot}
                  style={{
                    background: color,
                  }}
                />
                <span className={cn(statName, "min-w-[120px]")}>{c.name}</span>
                <span className={statTag}>{c.state.toUpperCase()}</span>
                <div className="ml-auto flex gap-1.5">
                  {!running && (
                    <button
                      className={ui.button.sm}
                      disabled={busy}
                      onClick={() => act(c, "start")}
                    >
                      Запустить
                    </button>
                  )}
                  {running && (
                    <button
                      className={ui.button.sm}
                      disabled={busy}
                      onClick={() => act(c, "stop")}
                    >
                      Стоп
                    </button>
                  )}
                  <button
                    className={ui.button.sm}
                    disabled={busy}
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
    return (
      <Placeholder icon="drop" title="AdGuard" phase="ADGUARD_URL не задан" />
    );
  }
  return (
    <Card
      icon="drop"
      title="AdGuard DNS"
      action={
        <span className={cn(ui.panelCount, "font-mono")}>
          {adguard.blockedPercent}% blocked
        </span>
      }
    >
      <div className={cn(gaugeRow, "mt-1")}>
        <div className={gaugeItem}>
          <Ring pct={adguard.blockedPercent} size={96} />
          <div className={gaugeLabel}>
            <div className={gaugeName}>BLOCKED</div>
            <div className={gaugeValue}>
              {adguard.blocked.toLocaleString("ru-RU")}
            </div>
          </div>
        </div>
        <div className={cn(gaugeItem, "justify-center")}>
          <div className={gaugeLabel}>
            <div className={gaugeName}>ЗАПРОСЫ</div>
            <div className={gaugeValue}>
              {adguard.dnsQueries.toLocaleString("ru-RU")}
            </div>
          </div>
        </div>
        <div className={cn(gaugeItem, "justify-center")}>
          <div className={gaugeLabel}>
            <div className={gaugeName}>ЛАТЕНТНОСТЬ</div>
            <div className={gaugeValue}>{adguard.avgProcessingMs}ms</div>
          </div>
        </div>
      </div>

      {adguard.topBlocked.length > 0 && (
        <div className="mt-4">
          <div className={cn(ui.panelTitle, "mb-2")}>Топ заблокированных</div>
          <div className={statList}>
            {adguard.topBlocked.map((d) => (
              <div
                key={d.domain}
                className={cn(statRow, "grid-cols-[1fr_auto]")}
              >
                <span className={statName}>{d.domain}</span>
                <span className={cn(statTag, "ml-auto")}>{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function PosterCacheCard({
  cache,
  onRefresh,
}: {
  cache: PosterCacheStatus;
  onRefresh: (d: PosterCacheStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pct = cache.maxBytes > 0 ? Math.round((cache.sizeBytes / cache.maxBytes) * 100) : 0;
  const sources = Object.entries(cache.sources).sort((a, b) => b[1].sizeBytes - a[1].sizeBytes);

  const purge = async () => {
    if (busy) return;
    const ok = window.confirm("Очистить серверный кэш постеров?");
    if (!ok) return;
    setBusy(true);
    const cleared = await clearPosterCache();
    const fresh = await getPosterCacheStatus();
    onRefresh(fresh);
    setBusy(false);
    if (!cleared) window.alert("Не удалось очистить кэш постеров");
  };

  return (
    <Card
      icon="cloud"
      title="Poster cache"
      action={
        <button className={ui.button.sm} disabled={busy} onClick={purge}>
          Очистить
        </button>
      }
    >
      {!cache.configured ? (
        <div className="py-2.5 font-mono text-xs text-muted">
          Статус кэша недоступен.
        </div>
      ) : (
        <>
          <div className={cn(gaugeRow, "mt-1")}>
            <div className={gaugeItem}>
              <Ring pct={Math.min(100, pct)} size={96} />
              <div className={gaugeLabel}>
                <div className={gaugeName}>DISK CACHE</div>
                <div className={gaugeValue}>
                  {humanBytes(cache.sizeBytes)} / {humanBytes(cache.maxBytes)}
                </div>
              </div>
            </div>
            <div className={cn(gaugeItem, "justify-center")}>
              <div className={gaugeLabel}>
                <div className={gaugeName}>ФАЙЛЫ</div>
                <div className={gaugeValue}>{cache.files.toLocaleString("ru-RU")}</div>
              </div>
            </div>
          </div>
          <div className="mt-3 truncate font-mono text-2xs text-muted" title={cache.dir}>
            {cache.dir}
          </div>
          {sources.length > 0 && (
            <div className={cn(statList, "mt-3")}>
              {sources.map(([source, s]) => (
                <div key={source} className={cn(statRow, "grid-cols-[1fr_auto_auto]")}>
                  <span className={statName}>{source}</span>
                  <span className={statTag}>{s.files.toLocaleString("ru-RU")} files</span>
                  <span className={statTag}>{humanBytes(s.sizeBytes)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// /system — развёрнутая страница: Proxmox-гейджи, VM/LXC, таблица сервисов, Docker, AdGuard.
export function SystemPage() {
  const [proxmox, setProxmox] = useState<ProxmoxData>({
    configured: false,
    node: null,
    resource: null,
    vms: [],
  });
  const [servicesData, setServicesData] = useState<ServicesData>({
    configured: false,
    services: [],
  });
  const [docker, setDocker] = useState<DockerData>({
    configured: false,
    containers: [],
  });
  const [adguard, setAdguard] = useState<AdguardData>({
    configured: false,
    dnsQueries: 0,
    blocked: 0,
    blockedPercent: 0,
    avgProcessingMs: 0,
    topBlocked: [],
  });
  const [posterCache, setPosterCache] = useState<PosterCacheStatus>({
    configured: false,
    dir: "",
    maxBytes: 0,
    sizeBytes: 0,
    files: 0,
    sources: {},
  });

  useEffect(() => {
    getProxmox().then(setProxmox);
    getServices().then(setServicesData);
    getDocker().then(setDocker);
    getAdguard().then(setAdguard);
    getPosterCacheStatus().then(setPosterCache);
    const fastTimer = setInterval(() => {
      getProxmox().then(setProxmox);
      getDocker().then(setDocker);
      getAdguard().then(setAdguard);
    }, 30_000);
    const slowTimer = setInterval(
      () => {
        getServices().then(setServicesData);
        getPosterCacheStatus().then(setPosterCache);
      },
      60_000,
    );
    return () => {
      clearInterval(fastTimer);
      clearInterval(slowTimer);
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-[22px] max-[900px]:grid-cols-1">
        <div className="flex flex-col gap-5">
          {/* Proxmox нода */}
          {!proxmox.configured ? (
            <Placeholder
              icon="server"
              title="Proxmox"
              phase="Proxmox env не задан"
            />
          ) : proxmox.resource ? (
            <Card icon="server" title={`Proxmox · ${proxmox.node ?? "node"}`}>
              <div className={gaugeRow}>
                <div className={gaugeItem}>
                  <Ring pct={proxmox.resource.cpuPct} size={96} />
                  <div className={gaugeLabel}>
                    <div className={gaugeName}>CPU</div>
                    <div className={gaugeValue}>{proxmox.resource.cpuPct}%</div>
                  </div>
                </div>
                <div className={gaugeItem}>
                  <Ring pct={proxmox.resource.memPct} size={96} />
                  <div className={gaugeLabel}>
                    <div className={gaugeName}>RAM</div>
                    <div className={gaugeValue}>
                      {gb(proxmox.resource.memUsed)}/
                      {gb(proxmox.resource.memTotal)} ГБ
                    </div>
                  </div>
                </div>
                <div className={gaugeItem}>
                  <Ring pct={proxmox.resource.diskPct} size={96} />
                  <div className={gaugeLabel}>
                    <div className={gaugeName}>DISK</div>
                    <div className={gaugeValue}>
                      {gb(proxmox.resource.diskUsed)}/
                      {gb(proxmox.resource.diskTotal)} ГБ
                    </div>
                  </div>
                </div>
              </div>

              {/* VM / LXC */}
              {proxmox.vms.length > 0 && (
                <div className="mt-5">
                  <div className={cn(ui.panelTitle, "mb-3")}>
                    Виртуальные машины
                  </div>
                  <div className={statList}>
                    {proxmox.vms.map((vm) => {
                      const running = vm.status === "running";
                      const color = running ? "var(--ok)" : "var(--muted)";
                      return (
                        <div key={`${vm.type}-${vm.vmid}`} className={statRow}>
                          <span
                            className={statusDot}
                            style={{
                              background: color,
                            }}
                          />
                          <span className={statName}>{vm.name}</span>
                          <span className={statTag}>
                            {vm.type.toUpperCase()}
                          </span>
                          {running ? (
                            <span className="font-mono text-xs text-ink-soft">
                              CPU {vm.cpuPct}% · RAM {vm.memPct}%
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-muted">
                              ОСТАНОВЛЕНА
                            </span>
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
              <div className="py-2.5 font-mono text-xs text-muted">
                Нода недоступна.
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {/* Сервисы */}
          {!servicesData.configured ? (
            <Placeholder
              icon="cloud"
              title="Сервисы"
              phase="services.json не найден"
            />
          ) : (
            <Card
              icon="cloud"
              title="Сервисы"
              action={
                <span className={ui.panelCount}>
                  {servicesData.services.length} сервисов
                </span>
              }
            >
              {servicesData.services.length === 0 ? (
                <div className="py-2.5 font-mono text-xs text-muted">
                  Нет сервисов для мониторинга.
                </div>
              ) : (
                <div className={statList}>
                  {servicesData.services.map((s) => (
                    <div key={s.name} className={statRow}>
                      <span
                        className={statusDot}
                        style={{
                          background: STAT_VAR[s.status],
                        }}
                      />
                      <span className={statName}>{s.name}</span>
                      <span className={statTag}>{s.tag}</span>
                      <span
                        className="font-mono text-data tracking-1"
                        style={{ color: STAT_VAR[s.status] }}
                      >
                        {s.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Docker */}
          <DockerCard docker={docker} onRefresh={setDocker} />

          {/* AdGuard DNS */}
          <AdguardCard adguard={adguard} />

          {/* Backend diagnostics */}
          <BackendLogsCard />

          {/* Poster cache */}
          <PosterCacheCard cache={posterCache} onRefresh={setPosterCache} />
        </div>
      </div>
    </div>
  );
}
