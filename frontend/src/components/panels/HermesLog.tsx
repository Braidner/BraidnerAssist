import { useEffect, useState } from "react";
import { Card } from "../Card.tsx";
import { fmtUpdated } from "../../lib/format.ts";
import { getTaskLogs, type HermesData, type HermesTask, type PanelLogLine } from "../../lib/api.ts";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "в работе",
  done: "готово",
  todo: "ожидает",
};

function statusColor(status: string): string {
  if (status === "done") return "var(--ok)";
  if (status === "in_progress") return "var(--accent)";
  return "var(--info)";
}

// Hermes · агент — task-центричный виджет: список взятых задач + проваливание в их логи.
export function HermesLogPanel({ data, tasks }: { data: HermesData; tasks: HermesTask[] }) {
  const [selected, setSelected] = useState<HermesTask | null>(null);
  const [logs, setLogs] = useState<PanelLogLine[]>([]);
  const [loading, setLoading] = useState(false);

  // Если выбранная задача исчезла из обновлённого списка — вернуться к списку.
  useEffect(() => {
    if (selected && !tasks.some((t) => t.id === selected.id)) setSelected(null);
  }, [tasks, selected]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoading(true);
    getTaskLogs(selected.id).then((l) => {
      if (alive) { setLogs(l); setLoading(false); }
    });
    return () => { alive = false; };
  }, [selected]);

  const totalLogs = tasks.reduce((sum, t) => sum + t.logCount, 0);
  const current = selected ? tasks.find((t) => t.id === selected.id) ?? selected : null;

  return (
    <Card
      icon="bot"
      title="Hermes · агент"
      className="grow"
      action={
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          {tasks.length} в работе · {totalLogs} зап.
        </span>
      }
    >
      <div className="hermes-status">
        <span className={`pulse ${data.status === "active" ? "" : data.status}`} />
        <span className="hermes-state">
          статус: <b>{data.status}</b>
          {data.message ? ` · ${data.message}` : ""}
        </span>
      </div>

      <div className="scroll" style={{ marginTop: 8, flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}>
        {!current && (
          <>
            {tasks.length === 0 && (
              <div className="empty">Hermes пока не взял ни одной задачи в работу.</div>
            )}
            {tasks.map((t) => (
              <button key={t.id} className="hermes-task-row" onClick={() => setSelected(t)}>
                <span className="hermes-task-dot" style={{ background: statusColor(t.status) }} />
                <div className="hermes-task-body">
                  <div className="hermes-task-title">{t.title}</div>
                  <div className="hermes-task-sub">
                    <span className="tag">{STATUS_LABEL[t.status] ?? t.status}</span>
                    {t.claimedAt && <span>взято {fmtUpdated(t.claimedAt)}</span>}
                    {t.lastActivity && <span>· активность {fmtUpdated(t.lastActivity)}</span>}
                  </div>
                </div>
                <span className="hermes-task-count" title="записей лога">{t.logCount}</span>
              </button>
            ))}
          </>
        )}

        {current && (
          <div className="hermes-detail">
            <div className="hermes-detail-head">
              <button className="icon-btn" onClick={() => setSelected(null)} title="Назад к списку" aria-label="Назад">
                <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
              </button>
              <div className="hermes-detail-info">
                <div className="hermes-task-title">{current.title}</div>
                <div className="hermes-task-sub">
                  <span className="tag">{STATUS_LABEL[current.status] ?? current.status}</span>
                  {current.claimedAt && <span>взято {fmtUpdated(current.claimedAt)}</span>}
                  <span>· {current.logCount} логов</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 4 }}>
              {loading && <div className="empty">Загрузка логов…</div>}
              {!loading && logs.length === 0 && <div className="empty">По этой задаче ещё нет логов.</div>}
              {!loading && logs.map((l, i) => (
                <div key={i} className="log-line">
                  <span className="log-t">{l.t}</span>
                  <div>
                    <div className="log-msg">{l.msg}</div>
                    <span className="k">{l.k}</span> <span className="log-tag">· {l.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
