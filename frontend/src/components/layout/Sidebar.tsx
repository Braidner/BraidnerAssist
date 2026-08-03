import { NavLink } from "react-router-dom";
import type { UserRole } from "@/lib/auth";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";
import { icons, type IconName } from "../icons.tsx";

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  roles?: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", icon: "grid", label: "Обзор" },
  { to: "/media", icon: "pulse", label: "Медиа" },
  { to: "/hermes", icon: "bot", label: "Hermes" },
  { to: "/system", icon: "server", label: "Система" },
  { to: "/settings", icon: "gear", label: "Настройки", roles: ["admin"] },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  role: UserRole;
}

export function Sidebar({ open, onClose, role }: SidebarProps) {
  const navItem = (active = false) =>
    cn(
      "group relative flex h-12 items-center gap-0 overflow-hidden rounded-[14px] bg-transparent px-0 text-ink-soft no-underline transition-colors hover:bg-accent/10 hover:text-ink max-mob:gap-4 max-mob:px-2",
      open && "gap-4 px-2",
      active && "active text-accent shadow-[var(--accent-glow-sm)]",
    );

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[35] hidden bg-black/50 opacity-0 backdrop-blur-sm transition-opacity duration-300 max-mob:block",
          open && "pointer-events-auto opacity-100",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "sticky top-12 z-30 flex h-[calc(100vh-3rem)] w-[76px] flex-none flex-col items-stretch gap-1.5 overflow-hidden border-r border-hair bg-page px-3.5 py-[22px] transition-[width,padding,transform] duration-300",
          open && "w-[260px] px-[18px]",
          "max-mob:fixed max-mob:inset-0 max-mob:z-50 max-mob:h-screen max-mob:w-screen max-mob:-translate-x-full max-mob:border-r-0 max-mob:px-[22px] max-mob:pb-[calc(1.5rem+var(--safe-bottom))] max-mob:pt-[calc(1.5rem+var(--safe-top))] max-mob:shadow-[30px_0_70px_rgba(0,0,0,0.34)]",
          open && "max-mob:translate-x-0",
        )}
        aria-label="Главное меню"
      >
        <div className="mb-3 hidden items-center gap-3 px-1 pb-2 pt-0.5 max-mob:flex">
          <div className="min-w-0">
            <div className="text-head font-bold tracking-normal text-ink">Навигация</div>
            <div className="mt-0.5 font-mono text-data tracking-1 text-muted">Mission Control</div>
          </div>
          <button
            type="button"
            className={cn(ui.iconButton, "ml-auto")}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <icons.close className="size-5" />
          </button>
        </div>

        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map(({ to, icon, label }) => {
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
              <span className="grid size-12 flex-none place-items-center max-mob:size-10">
                <Ic className="size-[21px]" />
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-lead font-medium tracking-1 opacity-0 transition-opacity duration-200 max-mob:opacity-100",
                  open && "opacity-100",
                )}
              >
                {label}
              </span>
              <span className="absolute left-[7px] top-1/2 hidden h-[22px] w-1 -translate-y-1/2 rounded-full bg-accent group-[.active]:block" />
            </NavLink>
          );
        })}
      </aside>
    </>
  );
}
