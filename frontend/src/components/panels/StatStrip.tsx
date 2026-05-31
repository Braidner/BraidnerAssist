import type { WeatherData } from "../../lib/api.ts";

// WMO code → short uppercase label for stat strip
const WMO_SHORT: Record<number, string> = {
  0: "ЯСНО", 1: "ЯСНО", 2: "ОБЛАЧНО", 3: "ПАСМУРНО",
  45: "ТУМАН", 48: "ТУМАН",
  51: "МОРОСЬ", 53: "МОРОСЬ", 55: "МОРОСЬ",
  61: "ДОЖДЬ", 63: "ДОЖДЬ", 65: "ДОЖДЬ",
  71: "СНЕГ",  73: "СНЕГ",  75: "СНЕГ",
  77: "КРУПА",
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
    <div className="card neu" style={{ padding: "18px 20px", flex: 1, minWidth: 0, overflow: "hidden" }}>
      <div className="stat-num" style={{ fontSize: 30, whiteSpace: "nowrap" }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 3 }}>{unit}</span>}
      </div>
      <div className="stat-sub mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      {desc && <div className="stat-sub mono" style={{ marginTop: 2, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</div>}
    </div>
  );
}

interface StatStripProps {
  openTasks: number;
  weather: WeatherData;
}

export function StatStrip({ openTasks, weather }: StatStripProps) {
  const today = weather.current;
  const [d0, d1, d2] = weather.forecast ?? [];

  return (
    <div className="stat-strip">
      <MiniStat value={openTasks} unit="откр." sub="ЗАДАЧИ СЕГОДНЯ" />
      <MiniStat value="6/6" unit="up" sub="СЕРВИСЫ ОНЛАЙН" />

      {/* weather: сегодня */}
      {today ? (
        <MiniStat
          value={`${today.temp}°`}
          sub={`${d0 ? dayLabel(d0.date) : "СЕГОДНЯ"} · ${wmoShort(today.code)}`}
          desc={`ВЕТЕР ${today.wind} КМ/Ч`}
        />
      ) : (
        <MiniStat value="—" sub="ПОГОДА · СЕГОДНЯ" />
      )}

      {/* завтра */}
      {d1 ? (
        <MiniStat
          value={`${d1.max}°`}
          unit={`/ ${d1.min}°`}
          sub={`${dayLabel(d1.date)} · ${wmoShort(d1.code)}`}
        />
      ) : (
        <MiniStat value="—" sub="ПОГОДА · ЗАВТРА" />
      )}

      {/* послезавтра */}
      {d2 ? (
        <MiniStat
          value={`${d2.max}°`}
          unit={`/ ${d2.min}°`}
          sub={`${dayLabel(d2.date)} · ${wmoShort(d2.code)}`}
        />
      ) : (
        <MiniStat value="—" sub="ПОГОДА · ПОСЛЕЗАВТРА" />
      )}

      {/* шаги — мок до Phase 3 (Apple Health) */}
      <MiniStat value="—" sub="ШАГОВ · СЕГОДНЯ" />
    </div>
  );
}
