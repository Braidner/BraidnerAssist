import { useEffect, useState } from "react";
import { Card } from "../../../components/ui/Card.tsx";
import { Button } from "../../../components/ui/button.tsx";
import { fmtUpdated } from "../../../lib/format.ts";
import { cn } from "../../../lib/cn.ts";
import { ui } from "../../../lib/ui.ts";
import {
  getHermes,
  getHermesTasks,
  getTaskLogs,
  type HermesData,
  type HermesTask,
  type PanelLogLine,
} from "../../../lib/api.ts";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "в работе",
  done: "готово",
  todo: "ожидает",
};

function ledClass(status: string): string {
  if (status === "in_progress") return "bg-accent";
  if (status === "done") return "bg-ink-soft";
  return "bg-muted";
}

// Red is the live signal (One-Wire rule): only an in-progress task's label is accent.
function taskLabelColor(status: string): string {
  return status === "in_progress" ? "text-accent" : "text-ink-soft";
}

// Hermes · агент — task-центричный виджет: список взятых задач + проваливание в их логи.
export function HermesLogPanel() {
  const [data, setData] = useState<HermesData>({
    status: "idle",
    message: null,
    log: [],
  });
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

  useEffect(() => {
    if (selected && !tasks.some((t) => t.id === selected.id)) setSelected(null);
  }, [tasks, selected]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoading(true);
    getTaskLogs(selected.id).then((l) => {
      if (alive) {
        setLogs(l);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  const totalLogs = tasks.reduce((sum, t) => sum + t.logCount, 0);
  const current = selected
    ? (tasks.find((t) => t.id === selected.id) ?? selected)
    : null;
  const statusColor =
    data.status === "active"
      ? "bg-accent"
      : data.status === "error"
        ? "bg-bad"
        : "bg-muted";
  const statusWord =
    data.status === "active"
      ? "text-accent"
      : data.status === "error"
        ? "text-bad"
        : "text-ink-soft";

  return (
    <Card
      icon="bot"
      title="Hermes · агент"
      action={
        <span className={ui.panelCount}>
          {tasks.length} в работе · {totalLogs} зап.
        </span>
      }
    >
      <div className="mb-4 flex items-center gap-2.5 border-b border-hair pb-4">
        <span className={cn("size-2.5 rounded-full", statusColor)} />
        <span className="font-mono text-cell text-ink-soft">
          статус: <b className={cn("font-bold", statusWord)}>{data.status}</b>
          {data.message ? ` · ${data.message}` : ""}
        </span>
      </div>

      <div
        className="scroll"
        style={{ maxHeight: 520, marginRight: -8, paddingRight: 8 }}
      >
        {!current && (
          <div className="flex flex-col">
            {tasks.length === 0 && (
              <div className="py-2.5 font-mono text-xs text-ink-soft">
                Hermes пока не взял ни одной задачи в работу.
              </div>
            )}
            {tasks.map((t) => (
              <button
                key={t.id}
                className="grid w-full cursor-pointer grid-cols-[10px_1fr_auto] items-center gap-3 border-t border-hair bg-transparent px-1 py-3 text-left transition-colors hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                onClick={() => setSelected(t)}
              >
                <span className={cn("size-2 rounded-full", ledClass(t.status))} />
                <div style={{ minWidth: 0 }}>
                  <div className="truncate text-row font-medium text-ink">
                    {t.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-data text-muted">
                    <span className={taskLabelColor(t.status)}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {t.claimedAt && (
                      <span>· взято {fmtUpdated(t.claimedAt)}</span>
                    )}
                    {t.lastActivity && (
                      <span>· активность {fmtUpdated(t.lastActivity)}</span>
                    )}
                  </div>
                </div>
                <span className="rounded-full border border-hair bg-surface px-2 py-0.5 font-mono text-label text-muted" title="записей лога">
                  {t.logCount}
                </span>
              </button>
            ))}
          </div>
        )}

        {current && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setSelected(null)}
                title="Назад к списку"
                aria-label="Назад"
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
              </Button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-row font-medium text-ink">
                  {current.title}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-data text-muted">
                  <span className={taskLabelColor(current.status)}>
                    {STATUS_LABEL[current.status] ?? current.status}
                  </span>
                  {current.claimedAt && (
                    <span>· взято {fmtUpdated(current.claimedAt)}</span>
                  )}
                  <span>· {current.logCount} логов</span>
                </div>
              </div>
            </div>

            {loading && <div className="py-2.5 font-mono text-xs text-ink-soft">Загрузка логов…</div>}
            {!loading && logs.length === 0 && (
              <div className="py-2.5 font-mono text-xs text-ink-soft">
                По этой задаче ещё нет логов.
              </div>
            )}
            {!loading &&
              logs.map((l, i) => (
                <div key={i} className="grid grid-cols-[58px_1fr] gap-2 border-t border-hair py-2.5">
                  <span className="font-mono text-label text-muted">{l.t}</span>
                  <div>
                    <div className="text-cell leading-snug text-ink-soft">{l.msg}</div>
                    <span className="font-mono text-label text-muted">{l.k}</span>{" "}
                    <span className="font-mono text-label text-muted/80">· {l.tag}</span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </Card>
  );
}
