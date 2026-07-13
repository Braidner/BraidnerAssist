import { useState, useEffect } from "react";
import { Card } from "../../../components/ui/Card.tsx";
import { Placeholder } from "../../../components/panels/Placeholder.tsx";
import { getHassAutomations, toggleHassAutomation } from "../../../lib/api.ts";
import type { HassData } from "../../../lib/api.ts";
import { cn } from "../../../lib/cn.ts";
import { ui } from "../../../lib/ui.ts";

export function HomeAssistantPanel() {
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

  return (
    <Card
      icon="home"
      title="Home Assistant"
      action={<span className={ui.panelCount}>{onCount} активно</span>}
    >
      {data.automations.length === 0 ? (
        <div className="py-2.5 font-mono text-xs text-ink-soft">
          Автоматизаций не найдено
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.automations.map((x) => {
            const isOn = x.state === "on";
            return (
              <button
                key={x.entityId}
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label={x.name ?? x.entityId}
                title={x.entityId}
                onClick={() => onToggle(x.entityId)}
                className={cn(
                  "flex cursor-pointer flex-col rounded-xl border border-hair bg-surface p-3 text-left transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  isOn && "border-accent/40 bg-accent/10",
                )}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span
                    className={cn(
                      "size-2 rounded-full bg-faint",
                      isOn && "bg-accent",
                    )}
                  />
                  <span
                    className={cn(
                      "relative h-[15px] w-[30px] rounded-full border border-hair bg-surface transition-colors",
                      isOn && "border-accent/40",
                    )}
                  >
                    <span
                      className="absolute top-px size-[13px] rounded-full bg-muted transition-[left,background-color]"
                      style={{ left: isOn ? 13 : 1, background: isOn ? "var(--accent)" : undefined }}
                    />
                  </span>
                </div>
                <span
                  className={cn(
                    "line-clamp-2 text-body font-medium text-ink-soft",
                    isOn && "text-ink",
                  )}
                >
                  {x.name ?? x.entityId}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
