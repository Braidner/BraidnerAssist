import { icons } from "../icons.tsx";
import type { Theme } from "../../theme.ts";

type Backend = "up" | "down" | "checking";

interface TopBarProps {
  clock: Date;
  backend: Backend;
  theme: Theme;
  onToggleTheme: () => void;
}

const DOW = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONTH = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: Date): string {
  return `${DOW[d.getDay()]} · ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
}

export function TopBar({ clock, backend, theme, onToggleTheme }: TopBarProps) {
  const linkDot = backend === "up" ? "ok" : backend === "down" ? "bad" : "idle";
  const linkText = backend === "up" ? "LINK OK" : backend === "down" ? "NO LINK" : "…";

  return (
    <div className="mc-topbar">
      <div className="brand">
        <span className="brand-mark neu"><icons.target style={{ width: 26, height: 26 }} /></span>
        <div>
          <div className="brand-name">Mission Control</div>
          <div className="brand-sub mono">braidner · self-hosted · LAN-only</div>
        </div>
      </div>
      <div className="topbar-right">
        <span className="pill" title="Статус связи с backend">
          <span className={`dot ${linkDot}`} />
          {linkText}
        </span>
        <button className="pill" onClick={onToggleTheme} title="Переключить тему">
          {theme === "dark" ? <icons.sun style={{ width: 16, height: 16 }} /> : <icons.moon style={{ width: 16, height: 16 }} />}
        </button>
        <div className="clock">
          <div className="clock-time">{fmtTime(clock)}</div>
          <div className="clock-date mono">{fmtDate(clock)}</div>
        </div>
      </div>
    </div>
  );
}
