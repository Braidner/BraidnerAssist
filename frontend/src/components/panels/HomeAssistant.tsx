import { Card } from "../Card.tsx";
import { Placeholder } from "./Placeholder.tsx";
import type { HassData, HassAutomation } from "../../lib/api.ts";

interface Props {
  data: HassData;
  onToggle: (entityId: string) => void;
  flat?: boolean;
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

export function HomeAssistantPanel({ data, onToggle, flat }: Props) {
  if (!data.configured) {
    return <Placeholder icon="home" title="Home Assistant" phase="Phase 4" />;
  }

  const onCount = data.automations.filter((a) => a.state === "on").length;

  if (flat) {
    return (
      <div className="fcard" style={{ padding: 16 }}>
        <div className="ov-sec">
          <span className="ov-sec-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="ov-sec-label">Home Assistant</span>
          <span className="ov-sec-count">{onCount} активно</span>
        </div>
        {data.automations.length === 0 ? (
          <div className="empty">Автоматизаций не найдено</div>
        ) : (
          <div className="ov-grid-2">
            {data.automations.map((x) => {
              const isOn = x.state === "on";
              return (
                <div
                  key={x.entityId}
                  onClick={() => onToggle(x.entityId)}
                  className={`ov-toggle-card${isOn ? " on" : ""}`}
                >
                  <div className="flex-between">
                    <span className={`ov-dot${isOn ? " on" : ""}`}/>
                    <div className={`ov-mini-toggle${isOn ? " on" : ""}`}>
                      <span className="ov-mini-knob" style={{ left: isOn ? 13 : 1 }}/>
                    </div>
                  </div>
                  <div className={`ov-card-name${isOn ? " on" : ""}`}>
                    {x.name ?? x.entityId}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

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
