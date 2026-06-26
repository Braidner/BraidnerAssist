import { MiniWidgets } from "../../components/panels/StatStrip.tsx";
import { TasksPanel } from "./panels/TasksPanel.tsx";
import { HermesLogPanel } from "./panels/HermesLogPanel.tsx";
import { HomeAssistantPanel } from "./panels/HAssistantPanel.tsx";
import type {
  ServicesData, WeatherData, ProxmoxData,
} from "../../lib/api.ts";

interface OverviewPageProps {
  weather: WeatherData;
  proxmox: ProxmoxData;
  services: ServicesData;
}

export function OverviewPage({ weather, proxmox, services }: OverviewPageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <MiniWidgets weather={weather} proxmox={proxmox} services={services} />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '12px 24px 0', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 24px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TasksPanel flat />
          <HermesLogPanel flat />
        </div>
        <HomeAssistantPanel flat />
      </div>
    </div>
  );
}
