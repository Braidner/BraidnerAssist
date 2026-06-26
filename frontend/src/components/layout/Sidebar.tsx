import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";
import { icons, type IconName } from "../icons.tsx";

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", icon: "grid", label: "Обзор" },
  { to: "/media", icon: "pulse", label: "Медиа" },
  { to: "/hermes", icon: "bot", label: "Hermes" },
  { to: "/system", icon: "server", label: "Система" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
}

export function Sidebar({ open, onClose, onSettings }: SidebarProps) {
  const navItem = (active = false) =>
    cn(
      "group relative flex h-12 items-center gap-0 rounded-[14px] bg-transparent p-0 text-ink-soft no-underline transition-colors hover:text-ink max-[860px]:h-14 max-[860px]:gap-4 max-[860px]:px-2",
      active && "active text-accent",
    );

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[39] hidden bg-black/50 opacity-0 backdrop-blur-sm transition-opacity duration-300 max-[860px]:block",
          open && "pointer-events-auto opacity-100",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "sticky top-0 z-30 flex h-screen w-[76px] flex-none flex-col items-stretch gap-1.5 overflow-hidden border-r border-hair bg-page px-3.5 py-[22px]",
          "max-[860px]:fixed max-[860px]:inset-y-0 max-[860px]:left-0 max-[860px]:z-40 max-[860px]:h-full max-[860px]:w-[min(82vw,320px)] max-[860px]:-translate-x-full max-[860px]:px-[18px] max-[860px]:py-6 max-[860px]:transition-transform max-[860px]:duration-300",
          open && "max-[860px]:translate-x-0",
        )}
      >
        <div className="mb-4 flex items-center justify-center gap-[13px] whitespace-nowrap px-0.5 pb-1 pt-1.5 max-[860px]:justify-start max-[860px]:px-1.5 max-[860px]:pb-2">
          <span className="grid size-[46px] flex-none place-items-center rounded-[14px] border border-hair bg-raise text-accent">
            <icons.target className="size-6" />
          </span>
          <span className="hidden max-[860px]:block">
            <div className="text-[17px] font-bold tracking-normal text-ink">
              Mission Control
            </div>
            <div className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-muted">
              braidner
            </div>
          </span>
          <button
            className={cn(ui.iconButton, "ml-auto hidden max-[860px]:grid")}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <icons.close className="size-5" />
          </button>
        </div>

        {NAV_ITEMS.map(({ to, icon, label }) => {
          const Ic = icons[icon];
          return (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => navItem(isActive)}
              onClick={onClose}
              title={label}
            >
              <span className="grid size-12 flex-none place-items-center max-[860px]:size-10">
                <Ic className="size-[21px]" />
              </span>
              <span className="hidden whitespace-nowrap text-[15px] font-medium tracking-[0.01em] max-[860px]:inline">
                {label}
              </span>
              <span className="absolute left-[7px] top-1/2 hidden h-[22px] w-1 -translate-y-1/2 rounded-full bg-accent group-[.active]:block" />
            </NavLink>
          );
        })}

        <span className="flex-1" />
        <button
          className={navItem()}
          onClick={() => {
            onSettings();
            onClose();
          }}
          title="Настройки"
        >
          <span className="grid size-12 flex-none place-items-center max-[860px]:size-10">
            <icons.gear className="size-[21px]" />
          </span>
          <span className="hidden whitespace-nowrap text-[15px] font-medium tracking-[0.01em] max-[860px]:inline">
            Настройки
          </span>
        </button>
      </aside>
    </>
  );
}
