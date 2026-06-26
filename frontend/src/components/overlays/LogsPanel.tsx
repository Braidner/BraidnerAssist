import { useEffect, useState } from "react";
import { icons } from "../icons.tsx";
import { getLogs, type LogEntry, type LogLevel } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";

interface LogsPanelProps {
  onClose: () => void;
}

function levelColor(l: LogLevel): string {
  if (l === "error") return "var(--bad)";
  if (l === "warn") return "var(--warn)";
  return "var(--muted)";
}

function levelLabel(l: LogLevel): string {
  if (l === "error") return "ERR";
  if (l === "warn") return "WRN";
  return "INF";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.level === filter);

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <>
      <div className={ui.overlay} onClick={onClose} aria-hidden />
      <aside
        className={cn(ui.drawer, "min-w-[min(92vw,680px)] max-w-[780px]")}
        aria-label="Логи бэкенда"
      >
        <div className={ui.drawerInner}>
          <div className={ui.drawerHead}>
            <div className={ui.drawerKind}>
              <icons.list style={{ width: 14, height: 14 }} />
              <span>Логи бэкенда</span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-data text-muted">
                обновляется каждые 5с
              </span>
            </div>
            <button className={ui.iconButton} onClick={onClose} title="Закрыть">
              <icons.close style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* filter chips */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {(["all", "error", "warn", "info"] as const).map((lvl) => (
              <button
                key={lvl}
                className={cn(
                  ui.pill,
                  filter === lvl && "border-accent/50 bg-accent/15 text-accent",
                )}
                onClick={() => setFilter(lvl)}
              >
                {lvl === "all" ? "Все" : levelLabel(lvl as LogLevel)}
              </button>
            ))}
            <button className={ui.pill} onClick={load} title="Обновить">
              ↺
            </button>
          </div>

          <div className="scroll flex flex-col text-xs">
            {loading && (
              <div className="py-2.5 font-mono text-xs text-muted">
                Загрузка…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div className="py-2.5 font-mono text-xs text-muted">
                Записей нет.
              </div>
            )}
            {visible.map((e, i) => (
              <div
                key={i}
                className="grid grid-cols-[42px_70px_minmax(90px,150px)_1fr] items-start gap-2 border-t border-hair py-2.5 transition-colors hover:bg-surface/50"
                onClick={() => e.detail && toggle(i)}
                style={{ cursor: e.detail ? "pointer" : "default" }}
              >
                <span
                  className="font-mono text-label font-bold"
                  style={{ color: levelColor(e.level) }}
                >
                  {levelLabel(e.level)}
                </span>
                <span className="font-mono text-label text-muted">
                  {fmtTime(e.t)}
                </span>
                <span className="truncate font-mono text-label text-muted">
                  {e.ctx}
                </span>
                <span className="min-w-0 text-cell leading-snug text-ink-soft">
                  {e.msg}
                </span>
                {e.detail && expanded.has(i) && (
                  <pre className="col-span-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-hair bg-surface p-3 font-mono text-data leading-relaxed text-ink-soft">
                    {e.detail}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
