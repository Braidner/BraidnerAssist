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

function WeatherStat({ weather }: { weather: WeatherData }) {
  const { current, forecast } = weather;
  const [d0, d1, d2] = forecast ?? [];

  const colStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center",
  };
  const divStyle: React.CSSProperties = {
    borderLeft: "1px solid var(--hair)", paddingLeft: 14,
  };

  return (
    <div className="card neu stat-card">
      {!current ? (
        <div style={colStyle}>
          <div className="stat-num" style={{ fontSize: 30 }}>—</div>
          <div className="stat-sub mono" style={{ whiteSpace: "nowrap" }}>ПОГОДА · НЕ НАСТРОЕНО</div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
          {/* today */}
          <div style={colStyle}>
            <div className="stat-num" style={{ fontSize: 30, whiteSpace: "nowrap" }}>
              {current.temp}°
              <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 3 }}>C</span>
            </div>
            <div className="stat-sub mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d0 ? `${dayLabel(d0.date)} · ${wmoShort(current.code)}` : `СЕГОДНЯ · ${wmoShort(current.code)}`}
            </div>
            <div className="stat-sub mono" style={{ marginTop: 2, opacity: 0.7, whiteSpace: "nowrap" }}>
              ВЕТЕР {current.wind} КМ/Ч
            </div>
          </div>
          {/* tomorrow */}
          {d1 && (
            <div style={{ ...colStyle, ...divStyle }}>
              <div className="stat-num" style={{ fontSize: 24, whiteSpace: "nowrap" }}>
                {d1.max}°
                <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 2 }}>/{d1.min}°</span>
              </div>
              <div className="stat-sub mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {dayLabel(d1.date)} · {wmoShort(d1.code)}
              </div>
            </div>
          )}
          {/* day after */}
          {d2 && (
            <div style={{ ...colStyle, ...divStyle }}>
              <div className="stat-num" style={{ fontSize: 24, whiteSpace: "nowrap" }}>
                {d2.max}°
                <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 2 }}>/{d2.min}°</span>
              </div>
              <div className="stat-sub mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {dayLabel(d2.date)} · {wmoShort(d2.code)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function gb(bytes: number): number {
  return Math.round(bytes / 1024 ** 3);
}

function Gauge({ label, num, pct }: { label: string; num: string; pct: number }) {
  return (
    <div className="gauge">
      <div className="gauge-top">
        <span className="gauge-label">{label}</span>
        <span className="gauge-num">{num}</span>
      </div>
      <div className="bar"><i style={{ width: pct + "%" }} /></div>
    </div>
  );
}

function ProxmoxStat({ res, node }: { res: ProxmoxResource; node: string | null }) {
  return (
    <div className="card neu stat-card" style={{ justifyContent: "center", gap: 12 }}>
      <div className="stat-sub mono" style={{ marginTop: 0, opacity: 0.7, whiteSpace: "nowrap", letterSpacing: ".08em" }}>
        PROXMOX{node ? ` · ${node.toUpperCase()}` : ""}
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Gauge label="CPU" num={`${res.cpuPct}%`} pct={res.cpuPct} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Gauge label="RAM" num={`${gb(res.memUsed)}/${gb(res.memTotal)} ГБ`} pct={res.memPct} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Gauge label="DISK" num={`${gb(res.diskUsed)}/${gb(res.diskTotal)} ГБ`} pct={res.diskPct} />
        </div>
      </div>
    </div>
  );
}

function VMStat({ name, type, running, cpuPct, memPct }: {
  name: string; type: "qemu" | "lxc"; running: boolean; cpuPct: number; memPct: number;
}) {
  const color = running ? "var(--ok)" : "var(--muted)";
  return (
    <div className="card neu stat-card" style={{ justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="svc-dot" style={{ background: color, color }} />
        <span className="stat-num" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </div>
      <div className="stat-sub mono" style={{ whiteSpace: "nowrap" }}>
        {running ? `CPU ${cpuPct}% · RAM ${memPct}%` : "ОСТАНОВЛЕНА"}
      </div>
      <div className="stat-sub mono" style={{ marginTop: 2, opacity: 0.6 }}>{type.toUpperCase()}</div>
    </div>
  );
}

function ServiceStat({ name, status, tag }: { name: string; status: "ok" | "warn" | "bad"; tag: string }) {
  return (
    <div className="card neu stat-card" style={{ justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="svc-dot" style={{ background: STAT_VAR[status], color: STAT_VAR[status] }} />
        <span className="stat-num" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </div>
      <div className="stat-sub mono" style={{ whiteSpace: "nowrap" }}>{tag}</div>
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

  const tiles: React.ReactNode[] = [
    <div className="stat-tile stat-tile--wide" key="weather">
      <WeatherStat weather={weather} />
    </div>,
  ];

  if (res) {
    tiles.push(
      <div className="stat-tile stat-tile--proxmox" key="proxmox">
        <ProxmoxStat res={res} node={proxmox.node} />
      </div>,
    );
  }

  proxmox.vms.forEach((vm) => {
    tiles.push(
      <div className="stat-tile" key={`vm-${vm.type}-${vm.vmid}`}>
        <VMStat
          name={vm.name}
          type={vm.type}
          running={vm.status === "running"}
          cpuPct={vm.cpuPct}
          memPct={vm.memPct}
        />
      </div>,
    );
  });

  services.services.forEach((s) => {
    tiles.push(
      <div className="stat-tile" key={`svc-${s.name}`}>
        <ServiceStat name={s.name} status={s.status} tag={s.tag} />
      </div>,
    );
  });

  return (
    <div className="stat-strip-outer">
      <div className="stat-strip">
        {tiles}
      </div>
    </div>
  );
}
