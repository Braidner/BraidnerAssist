import { MiniWidgets } from "../../components/panels/StatStrip.tsx";
import { TasksPanel } from "./panels/TasksPanel.tsx";
import { HermesLogPanel } from "./panels/HermesLogPanel.tsx";
import { HomeAssistantPanel } from "./panels/HAssistantPanel.tsx";

export function OverviewPage() {
  return (
    <div className="flex flex-col">
      <MiniWidgets />
      <div className="mx-4 mt-3 h-px flex-none bg-hair sm:mx-6" />
      <div className="flex flex-col gap-3 px-4 pb-6 pt-3 sm:px-6">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <TasksPanel />
          <HermesLogPanel />
        </div>
        <HomeAssistantPanel />
      </div>
    </div>
  );
}
