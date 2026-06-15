import { icons } from "../icons.tsx";
import type { Theme } from "../../theme.ts";
import type { VersionData } from "../../lib/api.ts";

type Backend = "up" | "down" | "checking";

interface TopBarProps {
  clock: Date;
  backend: Backend;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
  onSettings: () => void;
  onLogs: () => void;
  onMenu: () => void;
  versionData: VersionData | null;
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

export function TopBar({ clock, backend, theme, onToggleTheme, onLogout, onSettings, onLogs, onMenu, versionData }: TopBarProps) {
  const linkDot = backend === "up" ? "ok" : backend === "down" ? "bad" : "idle";
  const linkText = backend === "up" ? "LINK OK" : backend === "down" ? "NO LINK" : "…";

  return (
    <div className="topbar anim">
      <div className="tb-left">
        <button className="menu-btn" onClick={onMenu} aria-label="Меню">
          <icons.menu style={{ width: 22, height: 22 }} />
        </button>
        <button className="tb-brand" onClick={onLogs} title="Открыть логи бэкенда">
          <div>
            <div className="tb-name">Mission Control</div>
            <div className="tb-sub mono">braidner · self-hosted · LAN-only</div>
          </div>
        </button>
      </div>

      <div className="tb-right">
        {versionData && (
          <span
            className={`chip${versionData.hasUpdate ? " version-warn" : ""}`}
            title={`${versionData.version} · ${versionData.sha}`}
          >
            {versionData.hasUpdate ? (
              <>
                v{versionData.version}
                <span style={{ opacity: 0.55, margin: "0 1px" }}>→</span>
                v{versionData.latest}
              </>
            ) : (
              <>
                v{versionData.version}
                <span className="mono" style={{ fontSize: 10, opacity: 0.55, marginLeft: 2 }}>{versionData.sha}</span>
              </>
            )}
          </span>
        )}
        <span className="chip" title="Статус связи с backend">
          <span className={`dot-led ${linkDot}`} />
          {linkText}
        </span>
        <button className="iconbtn" onClick={onSettings} title="Настройки">
          <icons.gear style={{ width: 20, height: 20 }} />
        </button>
        <button className="iconbtn" onClick={onToggleTheme} title="Переключить тему">
          {theme === "dark" ? <icons.sun style={{ width: 20, height: 20 }} /> : <icons.moon style={{ width: 20, height: 20 }} />}
        </button>
        <button className="iconbtn" onClick={onLogout} title="Выйти">
          <icons.logout style={{ width: 18, height: 18 }} />
        </button>
        <div className="tb-clock">
          <div className="tb-time">{fmtTime(clock)}</div>
          <div className="tb-date mono">{fmtDate(clock)}</div>
        </div>
      </div>
    </div>
  );
}
