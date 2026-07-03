import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/Card.tsx";
import { getLogs, type LogEntry, type LogLevel } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";

type LogFilter = LogLevel | "all";

function levelColor(level: LogLevel): string {
  if (level === "error") return "var(--bad)";
  if (level === "warn") return "var(--warn)";
  return "var(--muted)";
}

function levelLabel(level: LogFilter): string {
  if (level === "all") return "Все";
  if (level === "error") return "ERR";
  if (level === "warn") return "WRN";
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

export function BackendLogsCard() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (isAlive: () => boolean = () => true) => {
    const data = await getLogs();
    if (!isAlive()) return;
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    void load(isAlive);
    const timer = window.setInterval(() => void load(isAlive), 5_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const visible = useMemo(() => {
    const filtered = filter === "all"
      ? entries
      : entries.filter((entry) => entry.level === filter);
    return filtered.slice(0, 100);
  }, [entries, filter]);

  const entryKey = (entry: LogEntry): string =>
    `${entry.t}:${entry.level}:${entry.ctx}:${entry.msg}`;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card
      icon="pulse"
      title="Логи бэкенда"
      action={
        <div className="flex items-center gap-2">
          <span className={ui.panelCount}>{entries.length}</span>
          <button
            className={cn(ui.button.base, ui.button.sm)}
            onClick={() => void load()}
            title="Обновить"
          >
            ↺
          </button>
        </div>
      }
    >
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {(["all", "error", "warn", "info"] as const).map((level) => (
          <button
            key={level}
            className={cn(
              ui.button.base,
              ui.button.sm,
              filter === level && ui.button.accent,
            )}
            onClick={() => setFilter(level)}
          >
            {levelLabel(level)}
          </button>
        ))}
      </div>

      <div className="max-h-[520px] overflow-auto pr-1">
        {loading ? (
          <div className="py-2.5 font-mono text-xs text-muted">Загрузка…</div>
        ) : visible.length === 0 ? (
          <div className="py-2.5 font-mono text-xs text-muted">Записей нет.</div>
        ) : (
          <div className="flex flex-col text-xs">
            {visible.map((entry) => {
              const key = entryKey(entry);
              return (
                <div
                  key={key}
                  className="border-t border-hair py-2.5 transition-colors hover:bg-surface/50"
                >
                  <button
                    type="button"
                    className="flex w-full flex-col gap-1 text-left"
                    onClick={() => entry.detail && toggle(key)}
                    disabled={!entry.detail}
                    title={entry.detail ? "Показать детали" : undefined}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="font-mono text-label font-bold"
                        style={{ color: levelColor(entry.level) }}
                      >
                        {levelLabel(entry.level)}
                      </span>
                      <span className="font-mono text-label text-muted">
                        {fmtTime(entry.t)}
                      </span>
                      <span className="max-w-[140px] truncate font-mono text-label text-muted">
                        {entry.ctx}
                      </span>
                    </span>
                    <span className="min-w-0 text-cell leading-snug text-ink-soft">
                      {entry.msg}
                    </span>
                  </button>
                  {entry.detail && expanded.has(key) && (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-hair bg-surface p-3 font-mono text-data leading-relaxed text-ink-soft">
                      {entry.detail}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
