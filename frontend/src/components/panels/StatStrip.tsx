import { useRef, useEffect, useState, type ReactNode } from "react";
import {
  getWeather,
  getProxmox,
  getServices,
  type WeatherData,
  type ServicesData,
  type ProxmoxData,
  type ProxmoxResource,
} from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { useTasksCtx } from "../../lib/tasksContext.tsx";

const WMO_SHORT: Record<number, string> = {
  0: "ЯСНО",
  1: "ЯСНО",
  2: "ОБЛАЧНО",
  3: "ПАСМУРНО",
  45: "ТУМАН",
  48: "ТУМАН",
  51: "МОРОСЬ",
  53: "МОРОСЬ",
  55: "МОРОСЬ",
  61: "ДОЖДЬ",
  63: "ДОЖДЬ",
  65: "ДОЖДЬ",
  71: "СНЕГ",
  73: "СНЕГ",
  75: "СНЕГ",
  77: "КРУПА",
  80: "ЛИВЕНЬ",
  81: "ЛИВНИ",
  82: "ЛИВЕНЬ",
  85: "СНЕГОПАД",
  86: "СНЕГОПАД",
  95: "ГРОЗА",
  96: "ГРОЗА",
  99: "ГРОЗА",
};
function wmoShort(code: number): string {
  return WMO_SHORT[code] ?? WMO_SHORT[Math.floor(code / 10) * 10] ?? "ПЕРЕМ.";
}

const DOW = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "СЕГОДНЯ";
  const tom = new Date(today);
  tom.setDate(tom.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return "ЗАВТРА";
  return DOW[d.getDay()];
}

const STAT_VAR: Record<"ok" | "warn" | "bad", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

function gb(bytes: number): number {
  return Math.round(bytes / 1024 ** 3);
}

const statCard =
  "flex h-24 w-[300px] flex-none snap-start flex-col justify-center rounded-[18px] border border-hair bg-raise px-[18px] py-3.5";
const proxmoxCard = cn(statCard, "w-[360px]");
const serviceCard =
  "flex h-24 w-[206px] flex-none snap-start flex-col justify-center gap-[7px] overflow-hidden rounded-[18px] border border-hair bg-raise px-4 py-3.5";
const track = "h-[7px] overflow-hidden rounded-full bg-groove";
const trackFill =
  "block h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_70%,var(--ink)),var(--accent))]";
const monoUpper = "[font-family:var(--font)] uppercase";
const statusDot = "size-2 flex-none rounded-full";
const miniGrid =
  "grid grid-cols-[1fr_1.2fr_1fr_auto] gap-3 px-6 pb-1 pt-4 max-mob:grid-cols-2";
const miniCard =
  "shrink-0 rounded-[10px] border border-hair bg-surface-2 px-4 py-3.5";
const miniLabel =
  "mb-2 [font-family:var(--mono)] text-tiny uppercase tracking-3 text-muted";
const miniBar = "h-[3px] flex-1 overflow-hidden rounded-[3px] bg-groove";
const miniBarFill =
  "block h-full rounded-[3px] transition-[width] duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)]";

function Bar({ pct }: { pct: number }) {
  return (
    <div className={track}>
      <i
        className={trackFill}
        style={{ width: Math.min(100, Math.max(0, pct)) + "%" }}
      />
    </div>
  );
}

/* drag-to-scroll carousel with edge-fade mask (right side) */
function Carousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, x: 0, sl: 0 });
  const [grabbing, setGrabbing] = useState(false);

  const onDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { down: true, x: e.clientX, sl: el.scrollLeft };
    setGrabbing(true);
    el.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.down || !ref.current) return;
    ref.current.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
  };
  const onUp = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current.down = false;
    setGrabbing(false);
    try {
      el.releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex flex-col animate-[fade-up_0.34s_var(--ease)_both]">
      <div className="relative -mx-4 [-webkit-mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-16px),transparent_100%)] [mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-16px),transparent_100%)] max-mob:[-webkit-mask-image:linear-gradient(90deg,transparent_0,#000_16px,#000_calc(100%-16px),transparent_100%)] max-mob:[mask-image:linear-gradient(90deg,transparent_0,#000_16px,#000_calc(100%-16px),transparent_100%)]">
        <div
          className={cn(
            "flex cursor-grab touch-pan-y snap-x snap-proximity gap-3.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 py-1.5 scroll-smooth [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden [&>*]:snap-start",
            grabbing &&
              "cursor-grabbing scroll-auto select-none [&_*]:pointer-events-none",
          )}
          ref={ref}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function WeatherStat({ weather }: { weather: WeatherData }) {
  const { current, forecast } = weather;
  if (!current) {
    return (
      <div className={statCard}>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="[font-family:var(--font)] text-display font-bold leading-[0.9] text-ink">
              —
            </span>
            <span className="mt-1.5 [font-family:var(--font)] text-mini leading-[1.45] tracking-1 text-muted">
              ПОГОДА
              <br />
              НЕ НАСТРОЕНО
            </span>
          </div>
        </div>
      </div>
    );
  }
  const days = (forecast ?? []).slice(0, 3);
  return (
    <div className={statCard}>
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="whitespace-nowrap [font-family:var(--font)] text-display font-bold leading-[0.9] text-ink">
            {current.temp}
            <sup className="align-super text-body text-ink-soft">°C</sup>
          </span>
          <span className="mt-1.5 [font-family:var(--font)] text-mini leading-[1.45] tracking-1 text-muted">
            {wmoShort(current.code)}
            <br />
            ВЕТЕР {current.wind} КМ/Ч
          </span>
        </div>
        <div className="flex gap-3.5">
          {days.map((d) => (
            <div className="text-left" key={d.date}>
              <div className="[font-family:var(--font)] text-tiny tracking-3 text-muted">
                {dayLabel(d.date)}
              </div>
              <div className="mt-0.5 whitespace-nowrap [font-family:var(--font)] text-base font-bold text-ink">
                {d.max}°
                <small className="text-2xs font-medium text-muted">
                  /{d.min}°
                </small>
              </div>
              <div className="mt-px [font-family:var(--font)] text-micro tracking-2 text-faint">
                {wmoShort(d.code)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProxmoxStat({
  res,
  node,
}: {
  res: ProxmoxResource;
  node: string | null;
}) {
  return (
    <div className={proxmoxCard}>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[38px_1fr_auto] items-center gap-[11px]">
          <span
            className={cn(
              monoUpper,
              "text-2xs tracking-2 text-muted",
            )}
          >
            CPU
          </span>
          <Bar pct={res.cpuPct} />
          <span className="[font-family:var(--font)] whitespace-nowrap text-xs font-bold text-ink">
            {res.cpuPct}%
          </span>
        </div>
        <div className="grid grid-cols-[38px_1fr_auto] items-center gap-[11px]">
          <span
            className={cn(
              monoUpper,
              "text-2xs tracking-2 text-muted",
            )}
          >
            RAM
          </span>
          <Bar pct={res.memPct} />
          <span className="[font-family:var(--font)] whitespace-nowrap text-xs font-bold text-ink">
            {gb(res.memUsed)}/{gb(res.memTotal)} ГБ
          </span>
        </div>
        <div className="grid grid-cols-[38px_1fr_auto] items-center gap-[11px]">
          <span
            className={cn(
              monoUpper,
              "text-2xs tracking-2 text-muted",
            )}
          >
            DISK
          </span>
          <Bar pct={res.diskPct} />
          <span className="[font-family:var(--font)] whitespace-nowrap text-xs font-bold text-ink">
            {gb(res.diskUsed)}/{gb(res.diskTotal)} ГБ
          </span>
        </div>
      </div>
      {node && (
        <div className="mt-1.5 [font-family:var(--font)] text-tiny tracking-3 text-faint">
          PROXMOX · {node.toUpperCase()}
        </div>
      )}
    </div>
  );
}

function VMStat({
  name,
  type,
  running,
  cpuPct,
  memPct,
}: {
  name: string;
  type: "qemu" | "lxc";
  running: boolean;
  cpuPct: number;
  memPct: number;
}) {
  const color = running ? "var(--ok)" : "var(--muted)";
  return (
    <div className={serviceCard}>
      <div className="flex min-w-0 items-center gap-[9px]">
        <span
          className={statusDot}
          style={{
            background: color,
          }}
        />
        <span className="truncate whitespace-nowrap [font-family:var(--font)] text-sm font-bold text-ink">
          {name}
        </span>
      </div>
      <div className="whitespace-nowrap [font-family:var(--font)] text-data tracking-1 text-ink-soft">
        {running ? `CPU ${cpuPct}% · RAM ${memPct}%` : "ОСТАНОВЛЕНА"}
      </div>
      <div className="whitespace-nowrap [font-family:var(--font)] text-tiny tracking-3 text-faint">
        {type.toUpperCase()}
      </div>
    </div>
  );
}

function ServiceStat({
  name,
  status,
  tag,
}: {
  name: string;
  status: "ok" | "warn" | "bad";
  tag: string;
}) {
  const color = STAT_VAR[status];
  return (
    <div className={serviceCard}>
      <div className="flex min-w-0 items-center gap-[9px]">
        <span
          className={statusDot}
          style={{
            background: color,
          }}
        />
        <span className="truncate whitespace-nowrap [font-family:var(--font)] text-sm font-bold text-ink">
          {name}
        </span>
      </div>
      <div className="whitespace-nowrap [font-family:var(--font)] text-data tracking-1 text-ink-soft">
        {tag}
      </div>
    </div>
  );
}

interface StatStripProps {
  weather: WeatherData;
  proxmox: ProxmoxData;
  services: ServicesData;
}

export function StatStrip({ weather, proxmox, services }: StatStripProps) {
  const res = proxmox.configured ? proxmox.resource : null;

  const tiles: ReactNode[] = [<WeatherStat key="weather" weather={weather} />];

  if (res) {
    tiles.push(<ProxmoxStat key="proxmox" res={res} node={proxmox.node} />);
  }

  proxmox.vms.forEach((vm) => {
    tiles.push(
      <VMStat
        key={`vm-${vm.type}-${vm.vmid}`}
        name={vm.name}
        type={vm.type}
        running={vm.status === "running"}
        cpuPct={vm.cpuPct}
        memPct={vm.memPct}
      />,
    );
  });

  services.services.forEach((s) => {
    tiles.push(
      <ServiceStat
        key={`svc-${s.name}`}
        name={s.name}
        status={s.status}
        tag={s.tag}
      />,
    );
  });

  return <Carousel>{tiles}</Carousel>;
}

// ---------------------------------------------------------------------------
// MiniWidgets — flat strip of summary cards for the overview layout
// ---------------------------------------------------------------------------

export function MiniWidgets() {
  const { tasks } = useTasksCtx();
  const [weather, setWeather] = useState<WeatherData>({
    configured: false,
    current: null,
    forecast: [],
  });
  const [proxmox, setProxmox] = useState<ProxmoxData>({
    configured: false,
    node: null,
    resource: null,
    vms: [],
  });
  const [services, setServices] = useState<ServicesData>({
    configured: false,
    services: [],
  });

  useEffect(() => {
    getWeather().then(setWeather);
    getProxmox().then(setProxmox);
    getServices().then(setServices);
    const weatherT = setInterval(
      () => getWeather().then(setWeather),
      1_800_000,
    );
    const proxmoxT = setInterval(() => getProxmox().then(setProxmox), 30_000);
    const servicesT = setInterval(
      () => getServices().then(setServices),
      60_000,
    );
    return () => {
      clearInterval(weatherT);
      clearInterval(proxmoxT);
      clearInterval(servicesT);
    };
  }, []);
  const activeCount = tasks.filter((t) => !t.done).length;
  const serviceList = services?.services ?? [];
  const onlineCount = serviceList.filter((s) => s.status === "ok").length;

  const ramPct = proxmox?.resource ? Math.round(proxmox.resource.memPct) : 0;
  const diskPct = proxmox?.resource ? Math.round(proxmox.resource.diskPct) : 0;
  const ramVal = proxmox?.resource
    ? `${Math.round(proxmox.resource.memUsed / 1024)}/${Math.round(proxmox.resource.memTotal / 1024)}G`
    : "—";
  const diskVal = proxmox?.resource
    ? `${Math.round(proxmox.resource.diskUsed / 1024 / 1024)}/${Math.round(proxmox.resource.diskTotal / 1024 / 1024)}G`
    : "—";

  // weather code → emoji
  const wxIcon = (code: number) => {
    if (code === 0) return "☀️";
    if (code <= 2) return "⛅";
    if (code <= 48) return "🌫️";
    if (code <= 67) return "🌧️";
    if (code <= 77) return "❄️";
    if (code <= 82) return "🌦️";
    return "⛈️";
  };

  const days = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];

  return (
    <div className={miniGrid}>
      {/* Weather */}
      <div className={miniCard}>
        <div className={miniLabel}>Погода</div>
        {weather?.current ? (
          <div className="flex items-end justify-between">
            <div>
              <div className="[font-family:var(--mono)] text-4xl font-bold leading-none text-ink">
                {Math.round(weather.current.temp)}
                <sup className="align-super text-sm font-normal">°</sup>
              </div>
              <div className="mt-1 [font-family:var(--mono)] text-tiny tracking-1 text-muted">
                ВЕТЕР {weather.current.wind} м/с
              </div>
            </div>
            <div className="flex flex-col items-end gap-[3px]">
              {weather.forecast.slice(0, 3).map((d) => {
                const date = new Date(d.date);
                return (
                  <div key={d.date} className="flex items-center gap-1.5">
                    <span className="w-[18px] [font-family:var(--mono)] text-tiny text-muted">
                      {days[date.getDay()]}
                    </span>
                    <span style={{ fontSize: 11 }}>{wxIcon(d.code)}</span>
                    <span className="[font-family:var(--mono)] text-mini text-ink-soft">
                      {Math.round(d.max)}°
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-1 [font-family:var(--mono)] text-data text-muted">
            —
          </div>
        )}
      </div>

      {/* Proxmox */}
      <div className={miniCard}>
        <div className={miniLabel}>Proxmox</div>
        {proxmox?.resource ? (
          <div className="flex flex-col gap-2">
            {[
              {
                k: "CPU",
                pct: proxmox.resource.cpuPct,
                val: Math.round(proxmox.resource.cpuPct) + "%",
              },
              { k: "RAM", pct: ramPct, val: ramVal },
              { k: "DISK", pct: diskPct, val: diskVal },
            ].map((r) => (
              <div key={r.k} className="flex items-center gap-[9px]">
                <span className="w-7 shrink-0 [font-family:var(--mono)] text-tiny text-muted">
                  {r.k}
                </span>
                <div className={miniBar}>
                  <i
                    className={miniBarFill}
                    style={{
                      width: Math.min(r.pct, 100) + "%",
                      background: r.pct > 80 ? "var(--bad)" : "var(--accent)",
                    }}
                  />
                </div>
                <span className="w-[58px] shrink-0 text-right [font-family:var(--mono)] text-mini text-ink-soft">
                  {r.val}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-1 [font-family:var(--mono)] text-data text-muted">
            —
          </div>
        )}
      </div>

      {/* Services */}
      <div className={miniCard}>
        <div className="mb-2 flex items-center justify-between">
          <div className={cn(miniLabel, "mb-0")}>Сервисы</div>
          {serviceList.length > 0 && (
            <div className="[font-family:var(--mono)] text-tiny text-accent">
              {onlineCount}/{serviceList.length} online
            </div>
          )}
        </div>
        {serviceList.length > 0 ? (
          <div className="flex flex-col gap-[5px]">
            {serviceList.slice(0, 5).map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      s.status === "ok"
                        ? "var(--accent)"
                        : s.status === "warn"
                          ? "var(--warn)"
                          : "var(--bad)",
                  }}
                />
                <span className="flex-1 truncate whitespace-nowrap [font-family:var(--font)] text-data text-ink-soft">
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="[font-family:var(--mono)] text-data text-muted">
            —
          </div>
        )}
      </div>

      {/* Active task count */}
      <div
        className={cn(miniCard, "flex min-w-[90px] flex-col justify-between")}
      >
        <div className={miniLabel}>Задачи</div>
        <div>
          <div className="[font-family:var(--mono)] text-5xl font-bold leading-none text-accent">
            {activeCount}
          </div>
          <div className="mt-1 [font-family:var(--mono)] text-mini tracking-1 text-muted">
            АКТИВНЫХ
          </div>
        </div>
      </div>
    </div>
  );
}
