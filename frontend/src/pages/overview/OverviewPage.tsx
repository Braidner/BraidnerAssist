import { MiniWidgets } from "../../components/panels/StatStrip.tsx";
import { TasksPanel } from "./panels/TasksPanel.tsx";
import { HermesLogPanel } from "./panels/HermesLogPanel.tsx";
import { HomeAssistantPanel } from "./panels/HAssistantPanel.tsx";

export function OverviewPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <MiniWidgets />
      <div
        style={{
          height: 1,
          background: "rgba(255,255,255,0.05)",
          margin: "12px 24px 0",
          flexShrink: 0,
        }}
      />
      <div
        className="flex flex-col gap-3 px-4 pb-6 pt-3 sm:px-6"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <TasksPanel flat />
          <HermesLogPanel flat />
        </div>
        <HomeAssistantPanel flat />
      </div>
    </div>
  );
}
