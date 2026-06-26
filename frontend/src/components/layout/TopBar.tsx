import { useState, useEffect } from "react";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import type { Theme } from "../../theme.ts";
import type { VersionData } from "../../lib/api.ts";
import { useTabsState } from "../../lib/tabsContext.tsx";
import { cn } from "../../lib/cn.ts";
import { Button } from "@/components/ui/button";

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
    <div className="sticky top-0 z-20 border-b border-hair bg-page/92 py-3 backdrop-blur-xl">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
          {(tabs ?? []).map((tab, i) => (
            <button
              key={tab}
              className={cn(
                "relative h-9 flex-none rounded-full border border-transparent px-3.5 font-mono text-data uppercase tracking-4 text-muted transition-colors hover:border-hair hover:bg-surface hover:text-ink-soft",
                activeTab === i &&
                  "border-hair bg-surface-2 text-ink after:absolute after:inset-x-4 after:-bottom-3.25 after:h-0.5 after:rounded-full after:bg-accent",
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
          <Button
            variant="ghost"
            size="icon"
            title="Настройки"
            onClick={onSettings}
          >
            <Settings />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-accent"
            title="Тема"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button variant="ghost" size="icon" title="Выход" onClick={onLogout}>
            <LogOut />
          </Button>
          <div className="hidden h-6 w-px bg-hair sm:block" />
          <div className="hidden min-w-17.5 flex-col items-end leading-none sm:flex">
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
