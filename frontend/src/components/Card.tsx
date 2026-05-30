import type { ReactNode } from "react";
import { icons, type IconName } from "./icons.tsx";

interface CardProps {
  icon?: IconName;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

// Оболочка карточки: .card.neu + шапка с иконкой/заголовком/действием.
export function Card({ icon, title, action, children, className = "" }: CardProps) {
  const Ic = icon ? icons[icon] : null;
  return (
    <div className={`card neu ${className}`}>
      <div className="card-head">
        <span className="card-title">
          {Ic && <span className="ic"><Ic /></span>}
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}
