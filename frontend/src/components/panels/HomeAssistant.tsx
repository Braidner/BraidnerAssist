import { Card } from "../Card.tsx";
import { Placeholder } from "./Placeholder.tsx";
import type { HassData, HassAutomation } from "../../lib/api.ts";

interface Props {
  data: HassData;
  onToggle: (entityId: string) => void;
}

function AutomationRow({ auto, onToggle }: { auto: HassAutomation; onToggle: (id: string) => void }) {
  const isOn = auto.state === "on";
  return (
    <div
      className="svc"
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => onToggle(auto.entityId)}
      title={auto.entityId}
    >
      <span
        className="svc-dot"
        style={{
          background: isOn ? "var(--ok)" : "var(--muted)",
          color: isOn ? "var(--ok)" : "var(--muted)",
        }}
      />
      <span className="svc-name" style={{ flex: 1 }}>{auto.name}</span>
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: isOn ? "var(--ok)" : "var(--muted)",
          minWidth: 22,
          textAlign: "right",
        }}
      >
        {isOn ? "ВКЛ" : "ВЫКЛ"}
      </span>
    </div>
  );
}

export function HomeAssistantPanel({ data, onToggle }: Props) {
  if (!data.configured) {
    return <Placeholder icon="home" title="Home Assistant" phase="Phase 4" />;
  }

  return (
    <Card icon="home" title="Home Assistant">
      {data.automations.length === 0 ? (
        <div className="empty" style={{ fontSize: 12 }}>Автоматизаций не найдено</div>
      ) : (
        data.automations.map((a) => (
          <AutomationRow key={a.entityId} auto={a} onToggle={onToggle} />
        ))
      )}
    </Card>
  );
}
