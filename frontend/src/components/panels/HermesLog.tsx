import { Card } from "../Card.tsx";
import type { HermesData } from "../../lib/api.ts";

function pulseClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "running" || s === "active") return "";
  if (s === "error" || s === "failed") return "error";
  return "idle";
}

// Hermes · сессии — список сессий напрямую из Hermes Agent API.
export function HermesLogPanel({
  data,
  onOpenSession,
}: {
  data: HermesData;
  onOpenSession: (id: string) => void;
}) {
  return (
    <Card
      icon="bot"
      title="Hermes · сессии"
      className="grow"
      action={<span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>hermes-agent</span>}
    >
      <div className="scroll" style={{ flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}>
        {!data.configured && (
          <div className="empty">Hermes недоступен. Задай HERMES_URL в .env.</div>
        )}
        {data.configured && (data.sessions ?? []).length === 0 && (
          <div className="empty">Сессий пока нет.</div>
        )}
        {(data.sessions ?? []).map((s) => (
          <div
            key={s.id}
            className="log-line"
            style={{ cursor: "pointer", alignItems: "center" }}
            onClick={() => onOpenSession(s.id)}
            title="Открыть чат сессии"
          >
            <span className={`pulse ${pulseClass(s.status)}`} />
            <div>
              <div className="log-msg">{s.title}</div>
              <span className="log-tag">{s.status}{s.t ? ` · ${s.t}` : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
