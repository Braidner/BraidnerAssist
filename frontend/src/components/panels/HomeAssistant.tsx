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
    <div className={`ha-row ${isOn ? "on" : ""}`} title={auto.entityId}>
      <span className="ha-dot" />
      <span className="ha-name">{auto.name}</span>
      <span className="sw-lbl">{isOn ? "ВКЛ" : "ВЫКЛ"}</span>
      <span
        className="sw"
        role="switch"
        aria-checked={isOn}
        onClick={() => onToggle(auto.entityId)}
      >
        <span className="knob" />
      </span>
    </div>
  );
}

export function HomeAssistantPanel({ data, onToggle }: Props) {
  if (!data.configured) {
    return <Placeholder icon="home" title="Home Assistant" phase="Phase 4" />;
  }

  const onCount = data.automations.filter((a) => a.state === "on").length;

  return (
    <Card
      icon="home"
      title="Home Assistant"
      action={<span className="panel-count">{onCount} активно</span>}
    >
      <div className="ha-list">
        {data.automations.length === 0 ? (
          <div className="empty">Автоматизаций не найдено</div>
        ) : (
          data.automations.map((a) => (
            <AutomationRow key={a.entityId} auto={a} onToggle={onToggle} />
          ))
        )}
      </div>
    </Card>
  );
}
