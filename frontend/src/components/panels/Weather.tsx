import { Card } from "../Card.tsx";
import type { WeatherData } from "../../lib/api.ts";

// WMO weather code → Russian short description
const WMO: Record<number, string> = {
  0: "Ясно",
  1: "В осн. ясно",
  2: "Переменная облачность",
  3: "Пасмурно",
  45: "Туман",
  48: "Иней",
  51: "Морось",
  53: "Морось",
  55: "Густая морось",
  61: "Небольшой дождь",
  63: "Дождь",
  65: "Сильный дождь",
  71: "Небольшой снег",
  73: "Снег",
  75: "Сильный снег",
  77: "Снежная крупа",
  80: "Ливень",
  81: "Ливни",
  82: "Сильный ливень",
  85: "Снегопад",
  86: "Сильный снегопад",
  95: "Гроза",
  96: "Гроза с градом",
  99: "Гроза с крупным градом",
};

function wmoDesc(code: number): string {
  return WMO[code] ?? WMO[Math.floor(code / 10) * 10] ?? "Переменная";
}

const DOW_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return "Завтра";
  return DOW_RU[d.getDay()];
}

export function WeatherPanel({ data }: { data: WeatherData }) {
  if (!data.configured || !data.current) {
    return (
      <Card icon="cloud" title="Погода">
        <div className="empty">Не настроено — укажи WEATHER_LAT / WEATHER_LON в .env</div>
      </Card>
    );
  }

  const { current, forecast } = data;

  return (
    <Card
      icon="cloud"
      title="Погода"
      action={<span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Open-Meteo</span>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Current conditions */}
        <div
          className="neu-in"
          style={{
            borderRadius: "calc(var(--radius) * 0.65)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div className="stat-num" style={{ fontSize: 38, lineHeight: 1 }}>
              {current.temp}
              <span style={{ fontSize: 18, color: "var(--muted)", marginLeft: 2 }}>°C</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {wmoDesc(current.code)}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>
            <div>ветер {current.wind} км/ч</div>
          </div>
        </div>

        {/* 3-day forecast */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {forecast.map((d) => (
            <div
              key={d.date}
              className="neu-sm"
              style={{
                borderRadius: "calc(var(--radius) * 0.5)",
                padding: "10px 6px",
                textAlign: "center",
              }}
            >
              <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>
                {dayLabel(d.date)}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>{d.max}°</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.min}°</div>
              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
                {wmoDesc(d.code)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
