import type { ReactNode } from "react";

type WidgetStatus = "ok" | "warn" | "down" | "idle";

interface WidgetProps {
  title: string;
  status?: WidgetStatus;
  statusLabel?: string;
  span?: 1 | 2;
  children?: ReactNode;
}

const statusText: Record<WidgetStatus, string> = {
  ok: "ONLINE",
  warn: "DEGRADED",
  down: "OFFLINE",
  idle: "STANDBY",
};

export function Widget({
  title,
  status = "idle",
  statusLabel,
  span = 1,
  children,
}: WidgetProps) {
  return (
    <section className="widget" data-span={span}>
      <header className="widget__head">
        <h2 className="widget__title">{title}</h2>
        <span className={`status status--${status}`}>
          <span className="status__dot" />
          {statusLabel ?? statusText[status]}
        </span>
      </header>
      <div className="widget__body">{children}</div>
    </section>
  );
}
