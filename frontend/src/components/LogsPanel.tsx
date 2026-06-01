import { useEffect, useState } from "react";
import { icons } from "./icons.tsx";
import { getLogs, type LogEntry, type LogLevel } from "../lib/api.ts";

interface LogsPanelProps {
  onClose: () => void;
}

function levelColor(l: LogLevel): string {
  if (l === "error") return "var(--bad)";
  if (l === "warn")  return "var(--warn)";
  return "var(--muted)";
}

function levelLabel(l: LogLevel): string {
  if (l === "error") return "ERR";
  if (l === "warn")  return "WRN";
  return "INF";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function LogsPanel({ onClose }: LogsPanelProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = async () => {
    const data = await getLogs();
    setEntries(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(t); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const visible = filter === "all" ? entries : entries.filter((e) => e.level === filter);

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} aria-hidden />
      <aside className="drawer neu open logs-panel" aria-label="Логи бэкенда">
        <div className="drawer-inner">
          <div className="drawer-head">
            <div className="drawer-kind">
              <icons.list style={{ width: 14, height: 14 }} />
              <span>Логи бэкенда</span>
              <span className="drawer-ref mono">обновляется каждые 5с</span>
            </div>
            <button className="icon-btn" onClick={onClose} title="Закрыть">
              <icons.close style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* filter chips */}
          <div className="logs-filter">
            {(["all", "error", "warn", "info"] as const).map((lvl) => (
              <button
                key={lvl}
                className={`pill logs-pill${filter === lvl ? " active" : ""}`}
                onClick={() => setFilter(lvl)}
              >
                {lvl === "all" ? "Все" : levelLabel(lvl as LogLevel)}
              </button>
            ))}
            <button className="pill logs-pill" onClick={load} title="Обновить">↺</button>
          </div>

          <div className="chat-feed scroll logs-feed">
            {loading && <div className="empty">Загрузка…</div>}
            {!loading && visible.length === 0 && (
              <div className="empty">Записей нет.</div>
            )}
            {visible.map((e, i) => (
              <div
                key={i}
                className="log-entry"
                onClick={() => e.detail && toggle(i)}
                style={{ cursor: e.detail ? "pointer" : "default" }}
              >
                <span className="log-level mono" style={{ color: levelColor(e.level) }}>
                  {levelLabel(e.level)}
                </span>
                <span className="log-time mono">{fmtTime(e.t)}</span>
                <span className="log-ctx mono">{e.ctx}</span>
                <span className="log-msg">{e.msg}</span>
                {e.detail && expanded.has(i) && (
                  <pre className="log-detail mono">{e.detail}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
