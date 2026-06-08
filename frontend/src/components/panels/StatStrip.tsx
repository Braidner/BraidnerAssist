import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { WeatherData, ServicesData, ProxmoxData, ProxmoxResource } from "../../lib/api.ts";

const WMO_SHORT: Record<number, string> = {
  0: "ЯСНО", 1: "ЯСНО", 2: "ОБЛАЧНО", 3: "ПАСМУРНО",
  45: "ТУМАН", 48: "ТУМАН",
  51: "МОРОСЬ", 53: "МОРОСЬ", 55: "МОРОСЬ",
  61: "ДОЖДЬ", 63: "ДОЖДЬ", 65: "ДОЖДЬ",
  71: "СНЕГ",  73: "СНЕГ",  75: "СНЕГ", 77: "КРУПА",
  80: "ЛИВЕНЬ", 81: "ЛИВНИ", 82: "ЛИВЕНЬ",
  85: "СНЕГОПАД", 86: "СНЕГОПАД",
  95: "ГРОЗА", 96: "ГРОЗА", 99: "ГРОЗА",
};
function wmoShort(code: number): string {
  return WMO_SHORT[code] ?? WMO_SHORT[Math.floor(code / 10) * 10] ?? "ПЕРЕМ.";
}

const DOW = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "СЕГОДНЯ";
  const tom = new Date(today); tom.setDate(tom.getDate() + 1);
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

function Bar({ pct }: { pct: number }) {
  return <div className="track"><i style={{ width: Math.min(100, Math.max(0, pct)) + "%" }} /></div>;
}

/* drag-to-scroll carousel: edge-fade mask + auto-hiding progress rail */
function Carousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const drag = useRef({ down: false, x: 0, sl: 0 });

  const sync = useCallback(() => {
    const el = ref.current, rail = railRef.current;
    if (!el || !rail) return;
    const max = el.scrollWidth - el.clientWidth;
    const carousel = el.closest(".carousel");
    carousel?.classList.toggle("scrollable", max > 4);
    const frac = max > 0 ? el.scrollLeft / max : 0;
    const vis = el.clientWidth / el.scrollWidth;
    rail.style.width = Math.max(14, vis * 100) + "%";
    rail.style.transform = `translateX(${frac * (100 / Math.max(vis, 0.0001) - 100)}%)`;
  }, []);

  useEffect(() => {
    sync();
    const r = () => sync();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, [sync, children]);

  const onDown = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    drag.current = { down: true, x: e.clientX, sl: el.scrollLeft };
    el.classList.add("grabbing");
    el.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.down || !ref.current) return;
    ref.current.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
  };
  const onUp = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    drag.current.down = false;
    el.classList.remove("grabbing");
    try { el.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div className="carousel anim">
      <div className="car-vp">
        <div
          className="car-track"
          ref={ref}
          onScroll={sync}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {children}
        </div>
      </div>
      <div className="car-rail"><i ref={railRef} /></div>
    </div>
  );
}

function WeatherStat({ weather }: { weather: WeatherData }) {
  const { current, forecast } = weather;
  if (!current) {
    return (
      <div className="scard neu lift">
        <div className="wx">
          <div className="wx-now">
            <span className="wx-temp">—</span>
            <span className="wx-meta mono">ПОГОДА<br />НЕ НАСТРОЕНО</span>
          </div>
        </div>
      </div>
    );
  }
  const days = (forecast ?? []).slice(0, 3);
  return (
    <div className="scard neu lift">
      <div className="wx">
        <div className="wx-now">
          <span className="wx-temp">{current.temp}<sup>°C</sup></span>
          <span className="wx-meta mono">{wmoShort(current.code)}<br />ВЕТЕР {current.wind} КМ/Ч</span>
        </div>
        <div className="wx-days">
          {days.map((d) => (
            <div className="wx-day" key={d.date}>
              <div className="dd">{dayLabel(d.date)}</div>
              <div className="dt">{d.max}°<small>/{d.min}°</small></div>
              <div className="dsky">{wmoShort(d.code)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProxmoxStat({ res, node }: { res: ProxmoxResource; node: string | null }) {
  return (
    <div className="scard pcard neu lift">
      <div className="pve">
        <div className="pve-row">
          <span className="pve-k">CPU</span><Bar pct={res.cpuPct} /><span className="pve-v">{res.cpuPct}%</span>
        </div>
        <div className="pve-row">
          <span className="pve-k">RAM</span><Bar pct={res.memPct} /><span className="pve-v">{gb(res.memUsed)}/{gb(res.memTotal)} ГБ</span>
        </div>
        <div className="pve-row">
          <span className="pve-k">DISK</span><Bar pct={res.diskPct} /><span className="pve-v">{gb(res.diskUsed)}/{gb(res.diskTotal)} ГБ</span>
        </div>
      </div>
      {node && (
        <div className="svc-kind" style={{ marginTop: 6 }}>PROXMOX · {node.toUpperCase()}</div>
      )}
    </div>
  );
}

function VMStat({ name, type, running, cpuPct, memPct }: {
  name: string; type: "qemu" | "lxc"; running: boolean; cpuPct: number; memPct: number;
}) {
  const color = running ? "var(--ok)" : "var(--muted)";
  return (
    <div className="svc-card neu lift">
      <div className="svc-top">
        <span className="dot-led" style={{ background: color, boxShadow: running ? `0 0 8px color-mix(in srgb, ${color} 70%, transparent)` : "none" }} />
        <span className="svc-nm">{name}</span>
      </div>
      <div className="svc-line">{running ? `CPU ${cpuPct}% · RAM ${memPct}%` : "ОСТАНОВЛЕНА"}</div>
      <div className="svc-kind">{type.toUpperCase()}</div>
    </div>
  );
}

function ServiceStat({ name, status, tag }: { name: string; status: "ok" | "warn" | "bad"; tag: string }) {
  const color = STAT_VAR[status];
  return (
    <div className="svc-card neu lift">
      <div className="svc-top">
        <span className="dot-led" style={{ background: color, boxShadow: `0 0 8px color-mix(in srgb, ${color} 70%, transparent)` }} />
        <span className="svc-nm">{name}</span>
      </div>
      <div className="svc-line">{tag}</div>
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
    tiles.push(<ServiceStat key={`svc-${s.name}`} name={s.name} status={s.status} tag={s.tag} />);
  });

  return <Carousel>{tiles}</Carousel>;
}
