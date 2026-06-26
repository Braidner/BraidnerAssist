// Страница /media/calendar — расписание выходящих эпизодов (Sonarr) и релизов
// фильмов (Radarr) на ближайшие дни. Группировка по датам, статус «есть файл/ждём».

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/ui/Card.tsx";
import { getCalendar, type CalendarItem } from "../../lib/api.ts";

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

function dayLabel(iso: string): string {
  const t = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(dayKey(iso)).getTime() - new Date(dayKey(today.toISOString())).getTime()) / 86_400_000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  if (diff === -1) return "Вчера";
  return t.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
}

export function MediaCalendarPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<CalendarItem[] | "loading">("loading");

  useEffect(() => {
    getCalendar(21).then(setItems);
  }, []);

  if (items === "loading") return <div className="page"><div className="empty" style={{ marginTop: 40 }}>Загружаем расписание…</div></div>;

  // Группируем по дню (items уже отсортированы по дате на бэке).
  const groups: { key: string; label: string; rows: CalendarItem[] }[] = [];
  for (const it of items) {
    if (!it.airDate) continue;
    const k = dayKey(it.airDate);
    let g = groups.find((x) => x.key === k);
    if (!g) { g = { key: k, label: dayLabel(it.airDate), rows: [] }; groups.push(g); }
    g.rows.push(it);
  }

  return (
    <div className="page">
      <button className="btn btn-sm mediadetail-back" onClick={() => nav("/media")}>← Медиатека</button>
      <Card icon="pulse" title="Расписание выхода" action={<span className="panel-count">{items.length}</span>}>
        {groups.length === 0 ? (
          <div className="empty">Ближайших выходов нет (Sonarr/Radarr calendar пуст или не настроен).</div>
        ) : (
          <div className="cal-groups">
            {groups.map((g) => (
              <div key={g.key} className="cal-group">
                <div className="cal-day">{g.label}</div>
                <div className="cal-rows">
                  {g.rows.map((it, i) => (
                    <div key={i} className={`cal-row ${it.hasFile ? "cal-has" : ""}`}>
                      <span className="cal-kind">{it.kind === "series" ? "📺" : "🎬"}</span>
                      <span className="cal-title" title={it.title}>
                        {it.title}
                        {it.kind === "series" && it.seasonNumber != null && (
                          <span className="cal-ep mono"> S{it.seasonNumber}{it.episodeNumber != null ? `E${it.episodeNumber}` : ""}</span>
                        )}
                        {it.episodeTitle && <span className="cal-eptitle"> · {it.episodeTitle}</span>}
                      </span>
                      {it.hasFile ? (
                        <span className="rel-badge cal-badge">есть</span>
                      ) : it.monitored ? (
                        <span className="cal-wait">ждём</span>
                      ) : (
                        <span className="cal-unmon">не мониторится</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
