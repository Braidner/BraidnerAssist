import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getLogs, type LogEntry, type LogLevel } from "../../lib/api.ts";

interface LogsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function LogsPanel({ open, onOpenChange }: LogsPanelProps) {
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
    if (!open) return;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [open]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[min(92vw,680px)] flex-col gap-0 sm:max-w-[780px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Логи бэкенда
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-data font-normal text-muted">
              обновляется каждые 5с
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          {/* filter chips */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {(["all", "error", "warn", "info"] as const).map((lvl) => (
              <Button
                key={lvl}
                variant={filter === lvl ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter(lvl)}
              >
                {lvl === "all" ? "Все" : levelLabel(lvl as LogLevel)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={load} title="Обновить">
              ↺
            </Button>
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
      </SheetContent>
    </Sheet>
  );
}
