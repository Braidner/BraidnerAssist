import { useState, useEffect } from "react";
import { Card } from "../../../components/ui/Card.tsx";
import { Placeholder } from "../../../components/panels/Placeholder.tsx";
import { getHassAutomations, toggleHassAutomation } from "../../../lib/api.ts";
import type { HassData, HassAutomation } from "../../../lib/api.ts";
import { cn } from "../../../lib/cn.ts";
import { ui } from "../../../lib/ui.ts";

function AutomationRow({
  auto,
  onToggle,
}: {
  auto: HassAutomation;
  onToggle: (id: string) => void;
}) {
  const isOn = auto.state === "on";
  return (
    <div
      className="flex items-center gap-3.5 border-t border-hair px-1 py-3.5"
      title={auto.entityId}
    >
      <span
        className={cn(
          "size-[9px] flex-none rounded-full bg-faint",
          isOn && "bg-accent",
        )}
      />
      <span className={cn("min-w-0 flex-1 truncate font-mono text-[13.5px] text-ink-soft", isOn && "text-ink")}>
        {auto.name}
      </span>
      <span className={cn("font-mono text-[10.5px] tracking-[0.08em] text-muted", isOn && "text-accent")}>
        {isOn ? "ВКЛ" : "ВЫКЛ"}
      </span>
      <span
        className="relative h-[22px] w-11 cursor-pointer rounded-full border border-hair bg-surface"
        role="switch"
        aria-checked={isOn}
        onClick={() => onToggle(auto.entityId)}
      >
        <span
          className={cn(
            "absolute left-[3px] top-[3px] size-4 rounded-full bg-muted transition-transform",
            isOn && "translate-x-[20px] bg-accent",
          )}
        />
      </span>
    </div>
  );
}

export function HomeAssistantPanel({ flat }: { flat?: boolean }) {
  const [data, setData] = useState<HassData>({
    configured: false,
    automations: [],
  });

  useEffect(() => {
    getHassAutomations().then(setData);
    const t = setInterval(() => getHassAutomations().then(setData), 30_000);
    return () => clearInterval(t);
  }, []);

  const onToggle = (entityId: string) => {
    setData((prev) => ({
      ...prev,
      automations: prev.automations.map((a) =>
        a.entityId === entityId
          ? { ...a, state: a.state === "on" ? "off" : "on" }
          : a,
      ),
    }));
    toggleHassAutomation(entityId).then((ok) => {
      if (!ok) getHassAutomations().then(setData);
    });
  };

  if (!data.configured) {
    return <Placeholder icon="home" title="Home Assistant" phase="Phase 4" />;
  }

  const onCount = data.automations.filter((a) => a.state === "on").length;

  if (flat) {
    return (
      <div className={cn(ui.panel, "p-4")}>
        <div className="mb-4 flex items-center gap-2 font-mono uppercase tracking-[0.16em]">
          <span className="text-accent">⌂</span>
          <span className="text-[12.5px] text-ink">Home Assistant</span>
          <span className={cn(ui.panelCount, "rounded border border-hair bg-surface px-2 py-1")}>
            {onCount} активно
          </span>
        </div>
        {data.automations.length === 0 ? (
          <div className="py-2.5 font-mono text-xs text-muted">
            Автоматизаций не найдено
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.automations.map((x) => {
              const isOn = x.state === "on";
              return (
                <div
                  key={x.entityId}
                  onClick={() => onToggle(x.entityId)}
                  className={cn(
                    "cursor-pointer rounded-[14px] border border-hair bg-surface p-3 transition-colors hover:border-accent/40",
                    isOn && "border-accent/40 bg-accent/10",
                  )}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className={cn("size-2 rounded-full bg-faint", isOn && "bg-accent")} />
                    <div className={cn("relative h-[15px] w-[30px] rounded-full border border-hair bg-surface", isOn && "border-accent/40")}>
                      <span
                        className="absolute top-px size-[13px] rounded-full bg-muted transition-[left,background-color]"
                        style={{ left: isOn ? 13 : 1 }}
                      />
                    </div>
                  </div>
                  <div className={cn("line-clamp-2 text-[13px] font-medium text-ink-soft", isOn && "text-ink")}>
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
      action={<span className={ui.panelCount}>{onCount} активно</span>}
    >
      <div className="flex flex-col">
        {data.automations.length === 0 ? (
          <div className="py-2.5 font-mono text-xs text-muted">
            Автоматизаций не найдено
          </div>
        ) : (
          data.automations.map((a) => (
            <AutomationRow key={a.entityId} auto={a} onToggle={onToggle} />
          ))
        )}
      </div>
    </Card>
  );
}
