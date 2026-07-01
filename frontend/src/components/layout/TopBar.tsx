import { useEffect, useState } from "react";
import {LogOut, Moon, Sun} from "lucide-react";
import type {Theme} from "@/theme.ts";
import type {VersionData} from "@/lib/api.ts";
import {useTabsState} from "../../lib/tabsContext.tsx";
import {cn} from "../../lib/cn.ts";
import {Button} from "@/components/ui/button";
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx";
import { icons } from "../icons.tsx";

type Backend = "up" | "down" | "checking";

interface TopBarProps {
	backend: Backend;
	menuOpen: boolean;
	theme: Theme;
	onToggleTheme: () => void;
	onLogout: () => void;
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
	                       backend,
	                       menuOpen,
	                       theme,
	                       onToggleTheme,
	                       onLogout,
	                       onMenu,
	                       versionData,
                       }: TopBarProps) {
	const {tabs, activeTab, onTabChange} = useTabsState();
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
	const backendTone = backend === "up" ? "bg-accent" : backend === "down" ? "bg-bad" : "bg-warn";
	const backendLabel = backend === "up" ? "Backend online" : backend === "down" ? "Backend offline" : "Backend check";

	return (
		<header className="app-topbar sticky top-0 z-40 w-full border-b border-hair bg-page/92 backdrop-blur-xl">
			<div className="flex h-12 w-full items-center justify-between gap-4 px-4 max-[480px]:px-3">
				<button
					type="button"
					className="flex min-w-0 flex-none cursor-pointer items-center gap-3 rounded-xl border border-transparent py-1.5 pr-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70"
					onClick={onMenu}
					aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
					aria-expanded={menuOpen}
				>
					<span className="grid size-9 flex-none place-items-center rounded-xl border border-accent/50 bg-raise text-accent shadow-[var(--accent-glow-sm)]">
						<icons.target className="size-5" />
					</span>
					<span className="hidden min-w-0 sm:block">
						<span className="block truncate text-body font-bold leading-none tracking-1 text-ink">
							Mission Control
						</span>
						<span className="mt-1 block font-mono text-tiny tracking-4 text-muted">
							by Braidner
						</span>
					</span>
				</button>

				<div className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
					<Tabs value={activeTab + ""}>
						<TabsList variant="line" className="gap-5 px-3 sm:gap-8 sm:px-6">
							{(tabs ?? []).map((tab, i) => (
								<TabsTrigger
									key={i}
									value={i + ""}
									className={[
										"h-full px-6 pb-0",
										"text-[13px] font-bold tracking-[0.04em]",

										"after:!bottom-[-8px]",
										"after:!h-[2px]",
									].join(" ")}
									onClick={() => onTabChange?.(i)}
								>
									{tab}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
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
		              <span style={{opacity: 0.55, margin: "0 2px"}}>→</span>v
		              {versionData.latest}
	              </>
              ) : (
	              versionLabel
              )}
            </span>
					)}
					<span
						className={cn("size-2.5 rounded-full shadow-[var(--accent-glow-sm)]", backendTone)}
						title={backendLabel}
					/>
					<div className="h-6 w-px bg-hair"/>
					<Button
						variant="ghost"
						size="icon"
						className="text-accent"
						title="Тема"
						onClick={onToggleTheme}
					>
						{theme === "dark" ? <Sun/> : <Moon/>}
					</Button>
					<Button variant="ghost" size="icon" title="Выход" onClick={onLogout}>
						<LogOut/>
					</Button>
					<div className="hidden h-6 w-px bg-hair sm:block"/>
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
		</header>
	);
}
