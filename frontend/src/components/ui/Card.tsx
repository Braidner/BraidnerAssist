import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";
import { icons, type IconName } from "../icons.tsx";

interface CardProps {
  icon?: IconName;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({
  icon,
  title,
  action,
  children,
  className = "",
}: CardProps) {
  const Ic = icon ? icons[icon] : null;
  return (
    <div
      className={cn(
        ui.panel,
        "anim flex flex-col",
        className,
      )}
    >
      <div className={ui.panelHead}>
        <span className={ui.panelTitle}>
          {Ic && (
            <span className="grid place-items-center text-ink-soft">
              <Ic className="size-[15px]" />
            </span>
          )}
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}
