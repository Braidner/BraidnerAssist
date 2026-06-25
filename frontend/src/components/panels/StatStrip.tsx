import { useRef, type ReactNode } from "react";
import type { WeatherData, ServicesData, ProxmoxData, ProxmoxResource, PanelTask } from "../../lib/api.ts";

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

/* drag-to-scroll carousel with edge-fade mask (right side) */
function Carousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, x: 0, sl: 0 });

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

// ---------------------------------------------------------------------------
// MiniWidgets — flat strip of summary cards for the overview layout
// ---------------------------------------------------------------------------

interface MiniWidgetsProps {
  weather: WeatherData | null;
  proxmox: ProxmoxData | null;
  services: ServicesData | null;
  tasks: PanelTask[];
}

export function MiniWidgets({ weather, proxmox, services, tasks }: MiniWidgetsProps) {
  const activeCount = tasks.filter(t => !t.done).length;
  const serviceList = services?.services ?? [];
  const onlineCount = serviceList.filter(s => s.status === 'ok').length;

  const ramPct = proxmox?.resource ? Math.round(proxmox.resource.memPct) : 0;
  const diskPct = proxmox?.resource ? Math.round(proxmox.resource.diskPct) : 0;
  const ramVal = proxmox?.resource
    ? `${Math.round(proxmox.resource.memUsed / 1024)}/${Math.round(proxmox.resource.memTotal / 1024)}G`
    : '—';
  const diskVal = proxmox?.resource
    ? `${Math.round(proxmox.resource.diskUsed / 1024 / 1024)}/${Math.round(proxmox.resource.diskTotal / 1024 / 1024)}G`
    : '—';

  // weather code → emoji
  const wxIcon = (code: number) => {
    if (code === 0) return '☀️';
    if (code <= 2) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    return '⛈️';
  };

  const days = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];

  return (
    <div className="mini-widgets">
      {/* Weather */}
      <div className="mw-card">
        <div className="mw-label">Погода</div>
        {weather?.current ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
                {Math.round(weather.current.temp)}<sup style={{ fontSize: 14, verticalAlign: 'super', fontWeight: 400 }}>°</sup>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.04em' }}>
                ВЕТЕР {weather.current.wind} м/с
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
              {weather.forecast.slice(0, 3).map((d) => {
                const date = new Date(d.date);
                return (
                  <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', width: 18 }}>{days[date.getDay()]}</span>
                    <span style={{ fontSize: 11 }}>{wxIcon(d.code)}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-soft)' }}>{Math.round(d.max)}°</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>—</div>
        )}
      </div>

      {/* Proxmox */}
      <div className="mw-card">
        <div className="mw-label">Proxmox</div>
        {proxmox?.resource ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { k: 'CPU',  pct: proxmox.resource.cpuPct, val: Math.round(proxmox.resource.cpuPct) + '%' },
              { k: 'RAM',  pct: ramPct, val: ramVal },
              { k: 'DISK', pct: diskPct, val: diskVal },
            ].map(r => (
              <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', width: 28, flexShrink: 0 }}>{r.k}</span>
                <div className="mw-fbar">
                  <i style={{ width: Math.min(r.pct, 100) + '%', background: r.pct > 80 ? 'var(--bad)' : 'var(--accent)' }}/>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--ink-soft)', width: 58, textAlign: 'right', flexShrink: 0 }}>{r.val}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>—</div>
        )}
      </div>

      {/* Services */}
      <div className="mw-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="mw-label" style={{ marginBottom: 0 }}>Сервисы</div>
          {serviceList.length > 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>
              {onlineCount}/{serviceList.length} online
            </div>
          )}
        </div>
        {serviceList.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {serviceList.slice(0, 5).map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: s.status === 'ok' ? 'var(--accent)' : s.status === 'warn' ? 'var(--warn)' : 'var(--bad)',
                  boxShadow: `0 0 5px ${s.status === 'ok' ? 'var(--accent)' : s.status === 'warn' ? 'var(--warn)' : 'var(--bad)'}`,
                }}/>
                <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--ink-soft)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>—</div>
        )}
      </div>

      {/* Active task count */}
      <div className="mw-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 90 }}>
        <div className="mw-label">Задачи</div>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 48, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{activeCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.04em' }}>АКТИВНЫХ</div>
        </div>
      </div>
    </div>
  );
}
