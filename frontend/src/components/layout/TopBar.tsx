import { useEffect, useState } from "react";
import {LogOut, Moon, Sun} from "lucide-react";
import type {Theme} from "@/theme.ts";
import {useTabsState} from "../../lib/tabsContext.tsx";
import {Button} from "@/components/ui/button";
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx";
import { useLocation } from "react-router-dom";
import { NAV_ITEMS } from "./Sidebar";
import type { DownloadQuotaSnapshot } from "@/lib/api.ts";
import { DownloadQuotaGauge } from "./DownloadQuotaGauge";

interface TopBarProps {
	menuOpen: boolean;
	theme: Theme;
	onToggleTheme: () => void;
	onLogout: () => void;
	onMenu: () => void;
	downloadQuota: DownloadQuotaSnapshot | null;
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
	                       menuOpen,
	                       theme,
	                       onToggleTheme,
	                       onLogout,
	                       onMenu,
	                       downloadQuota,
                       }: TopBarProps) {
	const {tabs, activeTab, onTabChange} = useTabsState();
	const {pathname} = useLocation();
	const section = NAV_ITEMS.find(({to}) => pathname === to || (to !== "/" && pathname.startsWith(to + "/")))?.label;
	const [now, setNow] = useState(new Date());
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 20000);
		return () => clearInterval(t);
	}, []);

	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");

	return (
		<header className="app-topbar sticky top-0 z-40 w-full border-b border-hair bg-page/92 backdrop-blur-xl">
			<div className="pultra-bar">
				<button
					type="button"
					className="pultra-lockup"
					onClick={onMenu}
					aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
					aria-expanded={menuOpen}
				>
					<img src="/brand-icon.svg" className="pultra-mark" alt="" />
					<b>Pultra</b>
					{section && <><span className="pultra-slash" aria-hidden="true">/</span><span className="pultra-section">{section}</span></>}
				</button>

				{tabs.length > 0 && <nav className="pultra-bar-tabs" aria-label={section ? `Вкладки: ${section}` : "Вкладки раздела"}>
					<Tabs value={String(activeTab)} onValueChange={(value) => onTabChange?.(Number(value))}>
						<TabsList variant="line" className="!h-10 gap-1 px-0 sm:gap-2">
							{tabs.map((tab, i) => <TabsTrigger key={tab} value={String(i)}
								className="h-full px-3 text-[13px] font-semibold after:!bottom-0 after:!h-[2px]">
								{tab}
							</TabsTrigger>)}
						</TabsList>
					</Tabs>
				</nav>}
				<div className="pultra-bar-tools flex flex-none items-center gap-1 sm:gap-2.5">
					<DownloadQuotaGauge quota={downloadQuota} />
					<Button
						variant="ghost"
						size="icon"
						className="text-accent"
						title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
						aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
						onClick={onToggleTheme}
					>
						{theme === "dark" ? <Sun/> : <Moon/>}
					</Button>
					<Button variant="ghost" size="icon" title="Выйти" aria-label="Выйти" onClick={onLogout}>
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
