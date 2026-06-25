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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {data.automations.map((x) => {
              const isOn = x.state === "on";
              return (
                <div
                  key={x.entityId}
                  onClick={() => onToggle(x.entityId)}
                  style={{
                    padding: '11px 12px', borderRadius: 8, cursor: 'pointer',
                    background: isOn ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isOn ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.045)'}`,
                    transition: 'background 0.18s, border-color 0.18s',
                    display: 'flex', flexDirection: 'column', gap: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: isOn ? 'var(--accent)' : 'var(--muted)',
                      boxShadow: isOn ? '0 0 8px var(--accent)' : 'none',
                      transition: 'all 0.2s', flexShrink: 0
                    }}/>
                    <div style={{
                      width: 30, height: 16, borderRadius: 8, position: 'relative',
                      background: isOn ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.08)', transition: 'background 0.22s'
                    }}>
                      <span style={{
                        position: 'absolute', top: 1,
                        left: isOn ? 13 : 1,
                        width: 12, height: 12, borderRadius: '50%',
                        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transition: 'left 0.22s'
                      }}/>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: isOn ? 'var(--ink)' : 'var(--ink-soft)', lineHeight: 1.3 }}>
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
