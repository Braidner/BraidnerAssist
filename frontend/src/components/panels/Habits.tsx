import { Card } from "../Card.tsx";
import { icons } from "../icons.tsx";
import { habits } from "../../data/mock.ts";

// Привычки · неделя — мок (заменяется Apple Health в Фазе 3).
export function HabitsPanel() {
  return (
    <Card icon="flame" title="Привычки · неделя">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {habits.map((h) => {
          const Hic = icons[h.icon];
          return (
            <div key={h.id} className="habit-row">
              <span className="habit-ic neu-sm"><Hic /></span>
              <div className="habit-info">
                <div className="habit-name">{h.name}</div>
                <div className="habit-val">{h.val}</div>
              </div>
              <div className="habit-week">
                {h.week.map((d, i) => (
                  <span key={i} className={`wk-dot ${d ? "on" : ""}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
