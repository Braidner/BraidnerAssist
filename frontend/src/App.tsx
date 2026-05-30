import { useEffect, useState } from "react";
import { useTheme } from "./theme.ts";
import { Widget } from "./components/Widget.tsx";

interface Healthz {
  ok: boolean;
  integrations: Record<string, boolean>;
}

export function App() {
  const { theme, toggle } = useTheme();
  const [clock, setClock] = useState(() => new Date());
  const [backend, setBackend] = useState<"up" | "down" | "checking">("checking");

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch("/healthz")
      .then((r) => (r.ok ? (r.json() as Promise<Healthz>) : Promise.reject()))
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">◆</span>
          <span className="topbar__name">MISSION&nbsp;CONTROL</span>
          <span className={`status status--${backend === "up" ? "ok" : backend === "down" ? "down" : "idle"}`}>
            <span className="status__dot" />
            {backend === "up" ? "LINK OK" : backend === "down" ? "NO LINK" : "..."}
          </span>
        </div>
        <div className="topbar__right">
          <time className="topbar__clock">{clock.toLocaleTimeString()}</time>
          <button className="btn-theme" onClick={toggle} title="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <main className="grid">
        <Widget title="TASKS HUB" status="idle" statusLabel="PHASE 2" span={2}>
          <p className="muted">GitLab + локальные задачи. Не подключено.</p>
        </Widget>

        <Widget title="HEALTH" status="idle" statusLabel="PHASE 3">
          <p className="muted">Apple Health. Не подключено.</p>
        </Widget>

        <Widget title="HOMELAB SERVICES" status="idle" statusLabel="PHASE 2">
          <p className="muted">Статус сервисов. Не подключено.</p>
        </Widget>

        <Widget title="HOME ASSISTANT" status="idle" statusLabel="PHASE 4">
          <p className="muted">Автоматизации и скрипты. Не подключено.</p>
        </Widget>

        <Widget title="WEATHER" status="idle" statusLabel="PHASE 2">
          <p className="muted">Open-Meteo. Не подключено.</p>
        </Widget>

        <Widget title="CALENDAR" status="idle" statusLabel="PHASE 3">
          <p className="muted">События на 3 дня. Не подключено.</p>
        </Widget>

        <Widget title="HERMES AGENT" status="idle" statusLabel="STANDBY" span={2}>
          <p className="muted">Монитор агента и очередь команд. Не подключено.</p>
        </Widget>
      </main>

      <footer className="footer">
        <span>v0.1.0 — Phase 1 skeleton</span>
        <span className="mono">{clock.toISOString().slice(0, 10)}</span>
      </footer>
    </div>
  );
}
