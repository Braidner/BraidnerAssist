# Self-Contained Widgets Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all data fetching out of `App.tsx` into self-contained widgets/pages, reducing `App.tsx` to auth + routing + UI chrome, and making `OverviewPage` prop-free.

**Architecture:** Introduce a `TasksContext` for the one piece of state shared across multiple components (tasks list, selected task, handlers). All other widgets fetch their own data internally. `OverviewPage` renders widgets with zero props. `App.tsx` retains only: auth, theme, clock, backend-check, version, sidebar/settings/logs UI toggles.

**Tech Stack:** React context API, existing `api.ts` functions, existing component structure — no new libraries.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/lib/tasksContext.tsx` | Tasks state + handlers + selectedTask; consumed by TasksPanel, Drawer, CommandPalette |
| Modify | `frontend/src/pages/overview/panels/TasksPanel.tsx` | Read from TasksContext instead of props |
| Modify | `frontend/src/components/layout/Drawer.tsx` | Read selectedTask from TasksContext |
| Modify | `frontend/src/pages/overview/panels/HermesLogPanel.tsx` | Fetch hermes+hermesTasks internally |
| Modify | `frontend/src/pages/overview/panels/HAssistantPanel.tsx` | Fetch hass internally |
| Modify | `frontend/src/components/panels/StatStrip.tsx` | Fetch weather+proxmox+services internally (MiniWidgets) |
| Modify | `frontend/src/components/layout/CommandPalette.tsx` | Fetch docker+adguard internally; get onAddTask from TasksContext |
| Modify | `frontend/src/pages/system/SystemPage.tsx` | Fetch proxmox+services+docker+adguard internally |
| Modify | `frontend/src/pages/system/HermesPage.tsx` | Fetch hermes+hermesTasks internally |
| Modify | `frontend/src/pages/overview/OverviewPage.tsx` | Remove all props; render widgets |
| Modify | `frontend/src/App.tsx` | Remove all data state/polling; wrap with TasksProvider |

---

### Task 1: Create TasksContext

**Files:**
- Create: `frontend/src/lib/tasksContext.tsx`

Tasks state is shared between `TasksPanel` (display/add/toggle/delete), `Drawer` (selectedTask), and `CommandPalette` (onAddTask). A context eliminates prop drilling through App.

- [ ] **Step 1: Create the context file**

```tsx
// frontend/src/lib/tasksContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getTasks, toggleTask, createTask, deleteTask, type PanelTask } from "./api.ts";

interface TasksCtx {
  tasks: PanelTask[];
  selectedTask: PanelTask | null;
  onToggleTask: (task: PanelTask) => void;
  onAddTask: (title: string) => void;
  onSelectTask: (task: PanelTask) => void;
  onDeleteTask: (task: PanelTask) => void;
}

const Ctx = createContext<TasksCtx | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<PanelTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<PanelTask | null>(null);

  useEffect(() => {
    getTasks().then(setTasks);
    const t = setInterval(() => getTasks().then(setTasks), 300_000);
    return () => clearInterval(t);
  }, []);

  const onToggleTask = (task: PanelTask) => {
    if (task.tag === "gitlab") return;
    const done = !task.done;
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done } : x)));
    toggleTask(task.id, done).then((ok) => {
      if (!ok) setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done: !done } : x)));
    });
  };

  const onAddTask = (title: string) => {
    createTask(title).then((task) => {
      if (task) setTasks((ts) => [task, ...ts]);
    });
  };

  const onSelectTask = (task: PanelTask) => setSelectedTask(task);

  const onDeleteTask = (task: PanelTask) => {
    const prev = tasks;
    setTasks((ts) => ts.filter((x) => x.id !== task.id));
    if (selectedTask?.id === task.id) setSelectedTask(null);
    deleteTask(task.id).then((ok) => {
      if (!ok) setTasks(prev);
    });
  };

  return (
    <Ctx.Provider value={{ tasks, selectedTask, onToggleTask, onAddTask, onSelectTask, onDeleteTask }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTasksCtx(): TasksCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTasksCtx must be used inside TasksProvider");
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/tasksContext.tsx
git commit -m "feat: add TasksContext for shared tasks state"
```

---

### Task 2: Wire TasksPanel to TasksContext

**Files:**
- Modify: `frontend/src/pages/overview/panels/TasksPanel.tsx`

Remove the props interface (except `flat`) and read state from context instead.

- [ ] **Step 1: Update TasksPanel to use context**

Replace the props interface and destructuring:

```tsx
// Remove: interface TasksPanelProps and all data/handler props
// Keep only: flat?: boolean

import { useTasksCtx } from "../../../lib/tasksContext.tsx";

export function TasksPanel({ flat }: { flat?: boolean }) {
  const { tasks, onToggleTask: onToggle, onAddTask: onAdd, onSelectTask: onSelect, onDeleteTask: onDelete } = useTasksCtx();
  // rest of component unchanged
```

The rest of the component body (open count, showDone, visible, draft, submit, JSX) is unchanged.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/overview/panels/TasksPanel.tsx
git commit -m "refactor: TasksPanel reads tasks from TasksContext"
```

---

### Task 3: Wire Drawer to TasksContext

**Files:**
- Modify: `frontend/src/components/layout/Drawer.tsx`

`Drawer` currently receives `task` and `onClose` as props from App. Move selectedTask + close into context.

- [ ] **Step 1: Read the current Drawer**

```bash
cat -n frontend/src/components/layout/Drawer.tsx | head -20
```

- [ ] **Step 2: Update Drawer to use context**

Add `onCloseTask` to `TasksContext` (sets selectedTask to null), or just expose a setter. Simpler: expose `clearSelection`:

In `tasksContext.tsx`, add to the interface and provider:
```tsx
// add to interface:
clearSelection: () => void;

// add to provider body:
const clearSelection = () => setSelectedTask(null);

// add to Provider value:
clearSelection,
```

Then in `Drawer.tsx`, remove `task` and `onClose` props, read from context:
```tsx
import { useTasksCtx } from "../../lib/tasksContext.tsx";

export function Drawer() {
  const { selectedTask: task, clearSelection: onClose } = useTasksCtx();
  // rest unchanged
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/tasksContext.tsx frontend/src/components/layout/Drawer.tsx
git commit -m "refactor: Drawer reads selectedTask from TasksContext"
```

---

### Task 4: Self-contained HermesLogPanel

**Files:**
- Modify: `frontend/src/pages/overview/panels/HermesLogPanel.tsx`

Add `useEffect` to fetch and poll `hermes` + `hermesTasks` internally. Remove `data` and `tasks` props.

- [ ] **Step 1: Update HermesLogPanel**

```tsx
import { useEffect, useState } from "react";
import { Card } from "../../../components/ui/Card.tsx";
import { fmtUpdated } from "../../../lib/format.ts";
import { getHermes, getHermesTasks, getTaskLogs, type HermesData, type HermesTask, type PanelLogLine } from "../../../lib/api.ts";

export function HermesLogPanel({ flat }: { flat?: boolean }) {
  const [data, setData] = useState<HermesData>({ status: "idle", message: null, log: [] });
  const [tasks, setTasks] = useState<HermesTask[]>([]);
  const [selected, setSelected] = useState<HermesTask | null>(null);
  const [logs, setLogs] = useState<PanelLogLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getHermes().then(setData);
    getHermesTasks().then(setTasks);
    const t = setInterval(() => {
      getHermes().then(setData);
      getHermesTasks().then(setTasks);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // existing selected-cleanup and log-fetch effects unchanged (they depend on tasks/selected, not props)
  // ... rest of component unchanged
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/overview/panels/HermesLogPanel.tsx
git commit -m "refactor: HermesLogPanel fetches own data"
```

---

### Task 5: Self-contained HomeAssistantPanel

**Files:**
- Modify: `frontend/src/pages/overview/panels/HAssistantPanel.tsx`

Fetch hass data internally. Remove `data` and `onToggle` props.

- [ ] **Step 1: Update HomeAssistantPanel**

```tsx
import { useEffect, useState } from "react";
import { Card } from "../../../components/ui/Card.tsx";
import { Placeholder } from "../../../components/panels/Placeholder.tsx";
import { getHassAutomations, toggleHassAutomation, type HassData } from "../../../lib/api.ts";

export function HomeAssistantPanel({ flat }: { flat?: boolean }) {
  const [data, setData] = useState<HassData>({ configured: false, automations: [] });

  useEffect(() => {
    getHassAutomations().then(setData);
    const t = setInterval(() => getHassAutomations().then(setData), 30_000);
    return () => clearInterval(t);
  }, []);

  const onToggle = (entityId: string) => {
    setData((prev) => ({
      ...prev,
      automations: prev.automations.map((a) =>
        a.entityId === entityId ? { ...a, state: a.state === "on" ? "off" : "on" } : a
      ),
    }));
    toggleHassAutomation(entityId).then((ok) => {
      if (!ok) getHassAutomations().then(setData);
    });
  };

  // rest of JSX unchanged, now using local data/onToggle
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/overview/panels/HAssistantPanel.tsx
git commit -m "refactor: HomeAssistantPanel self-contained"
```

---

### Task 6: Self-contained MiniWidgets (StatStrip)

**Files:**
- Modify: `frontend/src/components/panels/StatStrip.tsx`

`MiniWidgets` currently takes `weather`, `proxmox`, `services`, `tasks` as props. Move fetching inside.

- [ ] **Step 1: Read the MiniWidgets component signature in StatStrip.tsx**

```bash
grep -n "export function MiniWidgets\|interface\|Props" frontend/src/components/panels/StatStrip.tsx | head -20
```

- [ ] **Step 2: Add internal state to MiniWidgets**

Find the `MiniWidgets` function and add fetching before the return. Import `useTasksCtx` for the tasks count (to avoid a duplicate fetch), and fetch weather/proxmox/services internally:

```tsx
import { useEffect, useState } from "react";
import { getWeather, getProxmox, getServices, type WeatherData, type ServicesData, type ProxmoxData } from "../../lib/api.ts";
import { useTasksCtx } from "../../lib/tasksContext.tsx";

export function MiniWidgets() {
  const { tasks } = useTasksCtx();
  const [weather, setWeather] = useState<WeatherData>({ configured: false, current: null, forecast: [] });
  const [proxmox, setProxmox] = useState<ProxmoxData>({ configured: false, node: null, resource: null, vms: [] });
  const [services, setServices] = useState<ServicesData>({ configured: false, services: [] });

  useEffect(() => {
    getWeather().then(setWeather);
    getProxmox().then(setProxmox);
    getServices().then(setServices);
    const weatherT = setInterval(() => getWeather().then(setWeather), 1_800_000);
    const proxmoxT = setInterval(() => getProxmox().then(setProxmox), 30_000);
    const servicesT = setInterval(() => getServices().then(setServices), 60_000);
    return () => { clearInterval(weatherT); clearInterval(proxmoxT); clearInterval(servicesT); };
  }, []);
  // rest of JSX unchanged
```

Remove the old `MiniWidgetsProps` interface.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/panels/StatStrip.tsx
git commit -m "refactor: MiniWidgets fetches own weather/proxmox/services data"
```

---

### Task 7: Self-contained CommandPalette

**Files:**
- Modify: `frontend/src/components/layout/CommandPalette.tsx`

Remove `containers`, `adguard`, `onAddTask` props. Fetch docker+adguard internally; get `onAddTask` from `TasksContext`.

- [ ] **Step 1: Read current CommandPalette props**

```bash
grep -n "interface\|Props\|export function CommandPalette" frontend/src/components/layout/CommandPalette.tsx | head -10
```

- [ ] **Step 2: Update CommandPalette**

```tsx
import { useEffect, useState } from "react";
import { getDocker, getAdguard, adguardProtection, type DockerData, type AdguardData } from "../../lib/api.ts";
import { useTasksCtx } from "../../lib/tasksContext.tsx";

export function CommandPalette() {
  const { onAddTask } = useTasksCtx();
  const [docker, setDocker] = useState<DockerData>({ configured: false, containers: [] });
  const [adguard, setAdguard] = useState<AdguardData>({ configured: false, dnsQueries: 0, blocked: 0, blockedPercent: 0, avgProcessingMs: 0, topBlocked: [] });

  useEffect(() => {
    getDocker().then(setDocker);
    getAdguard().then(setAdguard);
    const t = setInterval(() => { getDocker().then(setDocker); getAdguard().then(setAdguard); }, 30_000);
    return () => clearInterval(t);
  }, []);

  // rest of component: replace containers prop with docker.containers, adguard with local adguard
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/CommandPalette.tsx
git commit -m "refactor: CommandPalette fetches own docker/adguard data"
```

---

### Task 8: Self-contained HermesPage

**Files:**
- Modify: `frontend/src/pages/system/HermesPage.tsx`

Remove `data` and `tasks` props; fetch internally.

- [ ] **Step 1: Read current HermesPage signature**

```bash
grep -n "export function HermesPage\|interface\|Props" frontend/src/pages/system/HermesPage.tsx | head -10
```

- [ ] **Step 2: Update HermesPage**

```tsx
import { useEffect, useState } from "react"; // already imported
import { getHermes, getHermesTasks, /* existing imports */ } from "../../lib/api.ts";

export function HermesPage() {
  const [data, setData] = useState<HermesData>({ status: "idle", message: null, log: [] });
  const [tasks, setTasks] = useState<HermesTask[]>([]);

  useEffect(() => {
    getHermes().then(setData);
    getHermesTasks().then(setTasks);
    const t = setInterval(() => { getHermes().then(setData); getHermesTasks().then(setTasks); }, 60_000);
    return () => clearInterval(t);
  }, []);
  // rest of component unchanged
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/system/HermesPage.tsx
git commit -m "refactor: HermesPage fetches own data"
```

---

### Task 9: Self-contained SystemPage

**Files:**
- Modify: `frontend/src/pages/system/SystemPage.tsx`

Remove all props; fetch proxmox, services, docker, adguard internally.

- [ ] **Step 1: Read current SystemPage signature**

```bash
grep -n "export function SystemPage\|interface\|Props" frontend/src/pages/system/SystemPage.tsx | head -10
```

- [ ] **Step 2: Update SystemPage**

```tsx
import { useEffect, useState } from "react";
import { getProxmox, getServices, getDocker, getAdguard, dockerAction, type ProxmoxData, type ServicesData, type DockerData, type AdguardData } from "../../lib/api.ts";

export function SystemPage() {
  const [proxmox, setProxmox] = useState<ProxmoxData>({ configured: false, node: null, resource: null, vms: [] });
  const [servicesData, setServicesData] = useState<ServicesData>({ configured: false, services: [] });
  const [docker, setDocker] = useState<DockerData>({ configured: false, containers: [] });
  const [adguard, setAdguard] = useState<AdguardData>({ configured: false, dnsQueries: 0, blocked: 0, blockedPercent: 0, avgProcessingMs: 0, topBlocked: [] });

  useEffect(() => {
    getProxmox().then(setProxmox);
    getServices().then(setServicesData);
    getDocker().then(setDocker);
    getAdguard().then(setAdguard);
    const proxT = setInterval(() => getProxmox().then(setProxmox), 30_000);
    const svcT = setInterval(() => getServices().then(setServicesData), 60_000);
    const dkrT = setInterval(() => getDocker().then(setDocker), 30_000);
    const adgT = setInterval(() => getAdguard().then(setAdguard), 30_000);
    return () => { clearInterval(proxT); clearInterval(svcT); clearInterval(dkrT); clearInterval(adgT); };
  }, []);
  // replace onDockerUpdate prop with setDocker directly
```

For the `DockerCard`, replace `onRefresh` prop call with `setDocker` (pass `setDocker` as `onRefresh`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/system/SystemPage.tsx
git commit -m "refactor: SystemPage fetches own data"
```

---

### Task 10: Slim down OverviewPage

**Files:**
- Modify: `frontend/src/pages/overview/OverviewPage.tsx`

All props removed. Just render the self-contained widgets.

- [ ] **Step 1: Rewrite OverviewPage**

```tsx
import { MiniWidgets } from "../../components/panels/StatStrip.tsx";
import { TasksPanel } from "./panels/TasksPanel.tsx";
import { HermesLogPanel } from "./panels/HermesLogPanel.tsx";
import { HomeAssistantPanel } from "./panels/HAssistantPanel.tsx";

export function OverviewPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <MiniWidgets />
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/overview/OverviewPage.tsx
git commit -m "refactor: OverviewPage is now prop-free"
```

---

### Task 11: Slim down App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

Remove all data state + polling. Wrap tree with `TasksProvider`. `Drawer` and `CommandPalette` need no props. Route components need no data props.

- [ ] **Step 1: Rewrite App.tsx**

```tsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTheme } from "./theme.ts";
import { getVersion, setUnauthorizedHandler, type VersionData } from "./lib/api.ts";
import { TabsProvider } from "./lib/tabsContext.tsx";
import { TasksProvider } from "./lib/tasksContext.tsx";
import { SettingsPanel } from "./components/overlays/SettingsPanel.tsx";
import { LogsPanel } from "./components/overlays/LogsPanel.tsx";
import { getToken, clearToken } from "./lib/auth.ts";
import { LoginForm } from "./components/overlays/LoginForm.tsx";
import { Drawer } from "./components/layout/Drawer.tsx";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { TopBar } from "./components/layout/TopBar.tsx";
import { HermesPage } from "./pages/system/HermesPage.tsx";
import { SystemPage } from "./pages/system/SystemPage.tsx";
import { MediaRoutes } from "./pages/media/MediaRoutes.tsx";
import { OverviewPage } from "./pages/overview/OverviewPage.tsx";
import { CommandPalette } from "./components/layout/CommandPalette.tsx";

type Backend = "up" | "down" | "checking";

export function App() {
  const { theme, toggle } = useTheme();
  const [authed, setAuthed] = useState(() => Boolean(getToken()));

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
  }, []);

  const [clock, setClock] = useState(() => new Date());
  const [backend, setBackend] = useState<Backend>("checking");
  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [sbOpen, setSbOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sb-locked", sbOpen);
  }, [sbOpen]);

  useEffect(() => {
    if (!authed) return;
    fetch("/healthz")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));
    getVersion().then(setVersionData);
  }, [authed]);

  const onLogout = () => { clearToken(); setAuthed(false); };

  const location = useLocation();
  const isDetailPage = /\/media\/(series|movie)\//.test(location.pathname);

  if (!authed) {
    return (
      <div className="mc" data-theme={theme}>
        <LoginForm onSuccess={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <TabsProvider>
      <TasksProvider>
        <div className="mc" data-theme={theme}>
          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              onSave={() => setShowSettings(false)}
            />
          )}
          {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
          <CommandPalette />
          <Drawer />

          <Sidebar open={sbOpen} onClose={() => setSbOpen(false)} onSettings={() => setShowSettings(true)} />

          <div className="main">
            {!isDetailPage && (
              <TopBar
                clock={clock}
                backend={backend}
                theme={theme}
                onToggleTheme={toggle}
                onLogout={onLogout}
                onSettings={() => setShowSettings(true)}
                onLogs={() => setShowLogs(true)}
                onMenu={() => setSbOpen(true)}
                versionData={versionData}
              />
            )}

            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/hermes" element={<HermesPage />} />
              <Route path="/system" element={<SystemPage />} />
              <Route path="/media/*" element={<MediaRoutes />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </TasksProvider>
    </TabsProvider>
  );
}
```

Note: `SettingsPanel.onSave` previously called `getServices().then(setServicesData)`. Since `MiniWidgets` now polls services internally, just closing is sufficient. If an immediate refresh is needed, `MiniWidgets` can accept an optional `refreshKey` prop — but YAGNI: the 60s poll covers it.

Note: `MediaRoutes` previously took `media` + `onMediaUpdate` — see Task 12.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor: App.tsx stripped to auth + routing + UI chrome"
```

---

### Task 12: Self-contained MediaRoutes

**Files:**
- Modify: `frontend/src/pages/media/MediaRoutes.tsx`

Check if MediaRoutes already handles its own media state internally or just passes through props.

- [ ] **Step 1: Read MediaRoutes**

```bash
grep -n "export function MediaRoutes\|Props\|interface\|media\|onMedia" frontend/src/pages/media/MediaRoutes.tsx | head -20
```

- [ ] **Step 2: If MediaRoutes receives media props, internalize them**

If `media` and `onMediaUpdate` props exist, add internal state similarly to other pages:

```tsx
import { useEffect, useState } from "react";
import { getMedia, type MediaData } from "../../lib/api.ts";

export function MediaRoutes() {
  const [media, setMedia] = useState<MediaData>({ configured: false, torrserver: false, tmdb: false, nowPlaying: [], downloads: [] });

  const dlActive = media.downloads.some(
    (d) => d.progress < 100 && !/paused|stopped|completed|error/i.test(d.state),
  );

  useEffect(() => {
    getMedia().then(setMedia);
    const t = setInterval(() => getMedia().then(setMedia), dlActive ? 5_000 : 15_000);
    return () => clearInterval(t);
  }, [dlActive]);

  // pass media + onMediaUpdate={() => getMedia().then(setMedia)} to sub-routes as before
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/media/MediaRoutes.tsx
git commit -m "refactor: MediaRoutes self-contained media polling"
```

---

### Task 13: TypeScript build check

- [ ] **Step 1: Run TypeScript compiler**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 2: Fix any type errors**

Common issues to watch for:
- Props removed but still passed at call sites (TS will flag these as excess props)
- `Drawer` call in App still passing `task={selectedTask} onClose={...}` — remove these
- `CommandPalette` call still passing `containers={...}` etc — remove these
- Any component still importing old prop types

- [ ] **Step 3: Final commit if fixes needed**

```bash
git add -p
git commit -m "fix: remove stale props from call sites after widget refactor"
```

---

## Self-Review

**Spec coverage:**
- ✅ OverviewPage becomes prop-free
- ✅ App.tsx shrinks to auth + routing + UI chrome
- ✅ Each widget fetches own data
- ✅ Shared tasks state in context (used by TasksPanel, Drawer, CommandPalette)
- ✅ MediaRoutes handles own media polling (including adaptive 5s/15s logic)
- ✅ SystemPage, HermesPage self-contained

**Gaps checked:**
- `SettingsPanel.onSave` used to refresh services — covered by MiniWidgets' own 60s poll. No gap.
- `media.dlActive` adaptive polling — moved into MediaRoutes. ✅
- `Drawer` needs `clearSelection` added to TasksContext — covered in Task 3. ✅
- CommandPalette's `adguardProtection` action mutates state — it should call `getAdguard().then(setAdguard)` after toggling. Covered since adguard state is local to CommandPalette now. ✅

**Placeholder scan:** No TBDs or vague steps found.

**Type consistency:** `HermesData` initial value `{ status: "idle", message: null, log: [] }` used consistently in Tasks 4 and 8. `MediaData` initial value consistent in Task 12.
