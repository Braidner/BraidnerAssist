import { useRef, useState } from "react";
import type { WeatherData, ServicesData, HassData } from "../../lib/api.ts";

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

interface MiniStatProps {
  value: string | number;
  unit?: string;
  sub: string;
  desc?: string;
}

function MiniStat({ value, unit, sub, desc }: MiniStatProps) {
  return (
    <div className="card neu stat-card">
      <div className="stat-num" style={{ fontSize: 30, whiteSpace: "nowrap" }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 3 }}>{unit}</span>}
      </div>
      <div className="stat-sub mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      {desc && <div className="stat-sub mono" style={{ marginTop: 2, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</div>}
    </div>
  );
}

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

interface StatStripProps {
  openTasks: number;
  weather: WeatherData;
  services: ServicesData;
  hass: HassData;
}

export function StatStrip({ openTasks, weather, services, hass }: StatStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const sl = el.scrollLeft;
    let bestIdx = 0, minDist = Infinity;
    (Array.from(el.children) as HTMLElement[]).forEach((child, i) => {
      const dist = Math.abs(child.offsetLeft - sl);
      if (dist < minDist) { minDist = dist; bestIdx = i; }
    });
    setActiveIdx(bestIdx);
  };

  const scrollToIdx = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: (el.children[i] as HTMLElement).offsetLeft, behavior: "smooth" });
  };

  const onlineCount = services.services.filter((s) => s.status === "ok").length;
  const totalCount = services.services.length;
  const svcValue = services.configured && totalCount > 0 ? `${onlineCount}/${totalCount}` : "—";
  const svcSub = services.configured && totalCount > 0 ? "СЕРВИСЫ ОНЛАЙН" : "СЕРВИСЫ";

  const autoOnCount = hass.automations.filter((a) => a.state === "on").length;
  const autoTotal = hass.automations.length;
  const hassValue = hass.configured && autoTotal > 0 ? `${autoOnCount}/${autoTotal}` : "—";
  const hassSub = hass.configured && autoTotal > 0 ? "АВТОМАТИЗАЦИИ" : "HOME ASSISTANT";

  const TILE_COUNT = 4;

  return (
    <div className="stat-strip-outer">
      <div className="stat-strip" ref={scrollRef} onScroll={onScroll}>
        <div className="stat-tile">
          <MiniStat value={openTasks} unit="откр." sub="ЗАДАЧИ СЕГОДНЯ" />
        </div>
        <div className="stat-tile">
          <MiniStat value={svcValue} unit={services.configured && totalCount > 0 ? "up" : undefined} sub={svcSub} />
        </div>
        <div className="stat-tile stat-tile--wide">
          <WeatherStat weather={weather} />
        </div>
        <div className="stat-tile">
          <MiniStat value={hassValue} unit={hass.configured && autoTotal > 0 ? "вкл" : undefined} sub={hassSub} />
        </div>
      </div>
      <div className="stat-dots" aria-hidden="true">
        {Array.from({ length: TILE_COUNT }, (_, i) => (
          <button
            key={i}
            className={"stat-dot" + (i === activeIdx ? " active" : "")}
            onClick={() => scrollToIdx(i)}
          />
        ))}
      </div>
    </div>
  );
}
