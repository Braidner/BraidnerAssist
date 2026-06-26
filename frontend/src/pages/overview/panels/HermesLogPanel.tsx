import { useEffect, useState } from "react";
import { Card } from "../../../components/ui/Card.tsx";
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
  if (status === "done") return "bg-ok";
  if (status === "in_progress") return "bg-accent";
  return "bg-muted";
}

// Hermes · агент — task-центричный виджет: список взятых задач + проваливание в их логи.
export function HermesLogPanel({ flat }: { flat?: boolean }) {
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

  const innerContent = (
    <>
      <div className="mb-4 flex items-center gap-2.5 border-b border-hair pb-4">
        <span className={cn("size-2.5 rounded-full", statusColor)} />
        <span className="font-mono text-[12.5px] text-ink-soft">
          статус: <b className="font-bold text-accent">{data.status}</b>
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
              <div className="py-2.5 font-mono text-xs text-muted">
                Hermes пока не взял ни одной задачи в работу.
              </div>
            )}
            {tasks.map((t) => (
              <button
                key={t.id}
                className="grid w-full cursor-pointer grid-cols-[10px_1fr_auto] items-center gap-3 border-t border-hair bg-transparent px-1 py-3 text-left transition-colors hover:bg-surface/60"
                onClick={() => setSelected(t)}
              >
                <span className={cn("size-2 rounded-full", ledClass(t.status))} />
                <div style={{ minWidth: 0 }}>
                  <div className="truncate text-[13.5px] font-medium text-ink">
                    {t.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-muted">
                    <span className="text-accent">
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
                <span className="rounded-full border border-hair bg-surface px-2 py-0.5 font-mono text-[10.5px] text-muted" title="записей лога">
                  {t.logCount}
                </span>
              </button>
            ))}
          </div>
        )}

        {current && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <button
                className={ui.iconButton}
                onClick={() => setSelected(null)}
                title="Назад к списку"
                aria-label="Назад"
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink">
                  {current.title}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-muted">
                  <span className="text-accent">
                    {STATUS_LABEL[current.status] ?? current.status}
                  </span>
                  {current.claimedAt && (
                    <span>· взято {fmtUpdated(current.claimedAt)}</span>
                  )}
                  <span>· {current.logCount} логов</span>
                </div>
              </div>
            </div>

            {loading && <div className="py-2.5 font-mono text-xs text-muted">Загрузка логов…</div>}
            {!loading && logs.length === 0 && (
              <div className="py-2.5 font-mono text-xs text-muted">
                По этой задаче ещё нет логов.
              </div>
            )}
            {!loading &&
              logs.map((l, i) => (
                <div key={i} className="grid grid-cols-[58px_1fr] gap-2 border-t border-hair py-2.5">
                  <span className="font-mono text-[10.5px] text-muted">{l.t}</span>
                  <div>
                    <div className="text-[12.5px] leading-snug text-ink-soft">{l.msg}</div>
                    <span className="font-mono text-[10.5px] text-muted">{l.k}</span>{" "}
                    <span className="font-mono text-[10.5px] text-muted/80">· {l.tag}</span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );

  if (flat) {
    return (
      <div className={cn(ui.panel, "p-4")}>
        <div className="mb-4 flex items-center gap-2 font-mono uppercase tracking-[0.16em]">
          <span className="text-accent">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="8"
                r="4"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="text-[12.5px] text-ink">Hermes</span>
          <span className={cn(ui.panelCount, "rounded border border-hair bg-surface px-2 py-1")}>
            {tasks.filter((t) => t.status === "in_progress").length} активных
          </span>
        </div>
        {innerContent}
      </div>
    );
  }

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
      {innerContent}
    </Card>
  );
}
