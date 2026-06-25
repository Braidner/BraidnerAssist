import { useState, useEffect } from 'react';
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
  // tab navigation
  tabs?: string[];
  activeTab?: number;
  onTabChange?: (i: number) => void;
}

const days = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];
const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

export function TopBar({ theme, onToggleTheme, onLogout, onSettings, versionData, tabs, activeTab, onTabChange }: TopBarProps) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  const versionLabel = versionData
    ? `v${versionData.version}${versionData.sha ? ' ' + versionData.sha.slice(0, 7) : ''}`
    : '';

  return (
    <div className="lib-nav-sticky">
      <div className="lib-nav-bar">
        <div className="lnb-tabs">
          {(tabs ?? []).map((tab, i) => (
            <button
              key={tab}
              className={`lib-nav-tab${activeTab === i ? ' lnt-on' : ''}`}
              onClick={() => onTabChange?.(i)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="lnb-right">
          {versionLabel && (
            <span
              className={`lnb-chip${versionData?.hasUpdate ? ' version-warn' : ''}`}
              title={versionData ? `${versionData.version} · ${versionData.sha}` : ''}
            >
              {versionData?.hasUpdate ? (
                <>v{versionData.version}<span style={{ opacity: 0.55, margin: '0 2px' }}>→</span>v{versionData.latest}</>
              ) : versionLabel}
            </span>
          )}
          <div className="lnb-divider"/>
          <button className="lnb-icobtn" title="Настройки" onClick={onSettings}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <circle cx="7" cy="7" r="2.3" stroke="currentColor" strokeWidth="2"/>
              <circle cx="16" cy="17" r="2.3" stroke="currentColor" strokeWidth="2"/>
              <path d="M9.3 7H21M3 7h1.7M3 17h10.7M18.3 17H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="lnb-icobtn lnb-icobtn-theme" title="Тема" onClick={onToggleTheme}>
            {theme === 'dark' ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2L5.6 5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.3A3.8 3.8 0 0117.5 18H7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <button className="lnb-icobtn" title="Выход" onClick={onLogout}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M14 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H14M17 8l4 4-4 4M21 12H9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="lnb-divider"/>
          <div className="lnb-clock">
            <span className="lnb-time">{hh}:{mm}</span>
            <span className="lnb-date">{days[now.getDay()]} · {now.getDate()} {months[now.getMonth()]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
