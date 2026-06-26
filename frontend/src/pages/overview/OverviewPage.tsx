import { MiniWidgets } from "../../components/panels/StatStrip.tsx";
import { TasksPanel } from "./panels/TasksPanel.tsx";
import { HermesLogPanel } from "./panels/HermesLogPanel.tsx";
import { HomeAssistantPanel } from "./panels/HAssistantPanel.tsx";
import type {
  PanelTask, HermesData, HermesTask, ServicesData, WeatherData, ProxmoxData, HassData,
} from "../../lib/api.ts";

interface OverviewPageProps {
  weather: WeatherData;
  proxmox: ProxmoxData;
  services: ServicesData;
  tasks: PanelTask[];
  hermes: HermesData;
  hermesTasks: HermesTask[];
  hass: HassData;
  onToggleTask: (task: PanelTask) => void;
  onAddTask: (title: string) => void;
  onSelectTask: (task: PanelTask) => void;
  onDeleteTask: (task: PanelTask) => void;
  onToggleAutomation: (entityId: string) => void;
}

export function OverviewPage({
  weather, proxmox, services, tasks, hermes, hermesTasks, hass,
  onToggleTask, onAddTask, onSelectTask, onDeleteTask, onToggleAutomation,
}: OverviewPageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <MiniWidgets weather={weather} proxmox={proxmox} services={services} tasks={tasks} />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '12px 24px 0', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 24px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TasksPanel flat tasks={tasks} onToggle={onToggleTask} onAdd={onAddTask} onSelect={onSelectTask} onDelete={onDeleteTask} />
          <HermesLogPanel flat data={hermes} tasks={hermesTasks} />
        </div>
        <HomeAssistantPanel flat data={hass} onToggle={onToggleAutomation} />
      </div>
    </div>
  );
}
