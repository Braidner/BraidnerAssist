import { useState, useEffect } from "react";
import type { Theme } from "../../theme.ts";
import type { VersionData } from "../../lib/api.ts";
import { useTabsState } from "../../lib/tabsContext.tsx";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";

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

const days = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const months = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

export function TopBar({
  theme,
  onToggleTheme,
  onLogout,
  onSettings,
  versionData,
}: TopBarProps) {
  const { tabs, activeTab, onTabChange } = useTabsState();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  const versionLabel = versionData
    ? `v${versionData.version}${versionData.sha ? " " + versionData.sha.slice(0, 7) : ""}`
    : "";

  return (
    <div className="sticky top-0 z-20 mb-4 border-b border-hair bg-page/92 py-3 backdrop-blur-xl">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(tabs ?? []).map((tab, i) => (
            <button
              key={tab}
              className={cn(
                "relative h-9 flex-none rounded-full border border-transparent px-3.5 font-mono text-data uppercase tracking-4 text-muted transition-colors hover:border-hair hover:bg-surface hover:text-ink-soft",
                activeTab === i &&
                  "border-hair bg-surface-2 text-ink after:absolute after:inset-x-4 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-accent",
              )}
              onClick={() => onTabChange?.(i)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex flex-none items-center gap-2.5">
          {versionLabel && (
            <span
              className={cn(
                "hidden rounded-lg border border-hair bg-surface px-2.5 py-1 font-mono text-label tracking-1 text-muted sm:inline-flex",
                versionData?.hasUpdate && "border-warn/50 text-warn",
              )}
              title={
                versionData ? `${versionData.version} · ${versionData.sha}` : ""
              }
            >
              {versionData?.hasUpdate ? (
                <>
                  v{versionData.version}
                  <span style={{ opacity: 0.55, margin: "0 2px" }}>→</span>v
                  {versionData.latest}
                </>
              ) : (
                versionLabel
              )}
            </span>
          )}
          <div className="h-6 w-px bg-hair" />
          <button className={ui.iconButton} title="Настройки" onClick={onSettings}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <circle
                cx="7"
                cy="7"
                r="2.3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle
                cx="16"
                cy="17"
                r="2.3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M9.3 7H21M3 7h1.7M3 17h10.7M18.3 17H21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className={cn(ui.iconButton, "text-accent")}
            title="Тема"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="4.2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2L5.6 5.6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 18a4 4 0 010-8 5 5 0 019.6-1.3A3.8 3.8 0 0117.5 18H7z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          <button className={ui.iconButton} title="Выход" onClick={onLogout}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path
                d="M14 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H14M17 8l4 4-4 4M21 12H9.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="hidden h-6 w-px bg-hair sm:block" />
          <div className="hidden min-w-[70px] flex-col items-end leading-none sm:flex">
            <span className="font-mono text-title font-bold tracking-1 text-ink">
              {hh}:{mm}
            </span>
            <span className="mt-1 font-mono text-tiny uppercase tracking-4 text-muted">
              {days[now.getDay()]} · {now.getDate()} {months[now.getMonth()]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
