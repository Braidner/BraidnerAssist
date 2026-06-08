import { NavLink } from "react-router-dom";
import { icons, type IconName } from "./icons.tsx";

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", icon: "grid", label: "Обзор" },
  { to: "/tasks", icon: "list", label: "Задачи" },
  { to: "/home-assistant", icon: "home", label: "Home Assistant" },
  { to: "/hermes", icon: "bot", label: "Hermes" },
  { to: "/system", icon: "server", label: "Система" },
  { to: "/metrics", icon: "chart", label: "Метрики" },
  { to: "/notes", icon: "note", label: "Заметки" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
}

export function Sidebar({ open, onClose, onSettings }: SidebarProps) {
  return (
    <>
      <div className={`sb-backdrop ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sb-logo">
          <span className="sb-mark"><icons.target style={{ width: 24, height: 24 }} /></span>
          <span className="sb-word">
            <div className="t1">Mission Control</div>
            <div className="t2 mono">braidner</div>
          </span>
          <button className="sb-close" onClick={onClose} aria-label="Закрыть">
            <icons.close style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {NAV_ITEMS.map(({ to, icon, label }) => {
          const Ic = icons[icon];
          return (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `sb-item ${isActive ? "active" : ""}`}
              onClick={onClose}
              title={label}
            >
              <span className="sb-icon"><Ic style={{ width: 21, height: 21 }} /></span>
              <span className="sb-label">{label}</span>
            </NavLink>
          );
        })}

        <span className="sb-spacer" />
        <button className="sb-item" onClick={() => { onSettings(); onClose(); }} title="Настройки">
          <span className="sb-icon"><icons.gear style={{ width: 21, height: 21 }} /></span>
          <span className="sb-label">Настройки</span>
        </button>
      </aside>
    </>
  );
}
