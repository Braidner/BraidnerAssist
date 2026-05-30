import { Card } from "../Card.tsx";
import type { HermesData } from "../../lib/api.ts";

// Hermes · лог агента — реальный статус + последние действия (данные живут в App).
export function HermesLogPanel({ data }: { data: HermesData }) {
  return (
    <Card
      icon="bot"
      title="Hermes · лог агента"
      className="grow"
      action={<span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>claude · MCP</span>}
    >
      <div className="hermes-status">
        <span className={`pulse ${data.status === "active" ? "" : data.status}`} />
        <span className="hermes-state">
          статус: <b>{data.status}</b>
          {data.message ? ` · ${data.message}` : ""}
        </span>
      </div>
      <div className="scroll" style={{ marginTop: 8, flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}>
        {data.log.length === 0 && <div className="empty">Лог пуст. Hermes ещё не записал действий.</div>}
        {data.log.map((l, i) => (
          <div key={i} className="log-line">
            <span className="log-t">{l.t}</span>
            <div>
              <div className="log-msg">{l.msg}</div>
              <span className="k">{l.k}</span> <span className="log-tag">· {l.tag}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
