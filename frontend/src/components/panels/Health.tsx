import type { HealthSummary } from "../../lib/api.ts";
import { Card } from "../Card.tsx";
import { Ring } from "../Ring.tsx";
import { Placeholder } from "./Placeholder.tsx";

const DOW_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function dowShort(dateStr: string): string {
  return DOW_SHORT[new Date(dateStr + "T12:00:00").getDay()];
}

function WeeklyBars({ week }: { week: HealthSummary["week"] }) {
  const sorted = [...week].sort((a, b) => a.date.localeCompare(b.date));
  const maxSteps = Math.max(...sorted.map((d) => d.steps), 1);
  const todayStr = new Intl.DateTimeFormat("en-CA").format(new Date());

  return (
    <div className="health-bars">
      {sorted.map((day) => {
        const isToday = day.date === todayStr;
        const h = Math.max(4, Math.round((day.steps / maxSteps) * 40));
        return (
          <div key={day.date} className="health-bar-col">
            <div className="health-bar-track">
              <div
                className="health-bar-fill"
                style={{
                  height: h,
                  background: isToday ? "var(--accent)" : "var(--ink-soft)",
                  opacity: isToday ? 1 : 0.35,
                }}
              />
            </div>
            <div className="health-bar-label" style={{ color: isToday ? "var(--accent)" : undefined }}>
              {dowShort(day.date)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface HealthPanelProps {
  data: HealthSummary;
}

export function HealthPanel({ data }: HealthPanelProps) {
  if (!data.configured) {
    return <Placeholder icon="dumbbell" title="Активность" phase="Phase 3" />;
  }

  const { today, week } = data;
  const pct = today ? Math.min(100, Math.round((today.steps / 10000) * 100)) : 0;

  return (
    <Card icon="flame" title="Активность">
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Ring pct={pct} size={72} />
        <div>
          <div className="stat-num" style={{ fontSize: 26, lineHeight: 1 }}>
            {today ? today.steps.toLocaleString("ru-RU") : "—"}
          </div>
          <div className="stat-sub mono" style={{ marginTop: 3 }}>ШАГОВ</div>
          {today && (
            <div className="stat-sub mono" style={{ marginTop: 4 }}>
              {today.km.toFixed(2).replace(".", ",")} КМ
            </div>
          )}
        </div>
      </div>
      {week.length > 0 && <WeeklyBars week={week} />}
    </Card>
  );
}
