import { useEffect, useState } from "react";
import { Card } from "../../../components/ui/Card.tsx";
import { fmtUpdated } from "../../../lib/format.ts";
import { getHermes, getHermesTasks, getTaskLogs, type HermesData, type HermesTask, type PanelLogLine } from "../../../lib/api.ts";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "в работе",
  done: "готово",
  todo: "ожидает",
};

function ledClass(status: string): string {
  if (status === "done") return "done";
  if (status === "in_progress") return "work";
  return "todo";
}

// Hermes · агент — task-центричный виджет: список взятых задач + проваливание в их логи.
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
  const statusClass = data.status === "active" ? "busy" : data.status === "error" ? "error" : "";

  const innerContent = (
    <>
      <div className={`ag-status ${statusClass}`}>
        <span className="ag-pulse" />
        <span className="ag-txt">
          статус: <b>{data.status}</b>
          {data.message ? ` · ${data.message}` : ""}
        </span>
      </div>

      <div className="scroll" style={{ maxHeight: 520, marginRight: -8, paddingRight: 8 }}>
        {!current && (
          <div className="ag-list">
            {tasks.length === 0 && (
              <div className="empty">Hermes пока не взял ни одной задачи в работу.</div>
            )}
            {tasks.map((t) => (
              <button key={t.id} className="ag-row" onClick={() => setSelected(t)}>
                <span className={`ag-led ${ledClass(t.status)}`} />
                <div style={{ minWidth: 0 }}>
                  <div className="ag-l">{t.title}</div>
                  <div className="ag-m">
                    <span className="st">{STATUS_LABEL[t.status] ?? t.status}</span>
                    {t.claimedAt && <span>· взято {fmtUpdated(t.claimedAt)}</span>}
                    {t.lastActivity && <span>· активность {fmtUpdated(t.lastActivity)}</span>}
                  </div>
                </div>
                <span className="ag-n" title="записей лога">{t.logCount}</span>
              </button>
            ))}
          </div>
        )}

        {current && (
          <div>
            <div className="ag-detail-head">
              <button className="icon-btn" onClick={() => setSelected(null)} title="Назад к списку" aria-label="Назад">
                <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
              </button>
              <div className="ag-detail-info">
                <div className="ag-l">{current.title}</div>
                <div className="ag-m">
                  <span className="st">{STATUS_LABEL[current.status] ?? current.status}</span>
                  {current.claimedAt && <span>· взято {fmtUpdated(current.claimedAt)}</span>}
                  <span>· {current.logCount} логов</span>
                </div>
              </div>
            </div>

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
        )}
      </div>
    </>
  );

  if (flat) {
    return (
      <div className="fcard" style={{ padding: 16 }}>
        <div className="ov-sec">
          <span className="ov-sec-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span className="ov-sec-label">Hermes</span>
          <span className="ov-sec-count">{tasks.filter(t => t.status === "in_progress").length} активных</span>
        </div>
        {innerContent}
      </div>
    );
  }

  return (
    <Card
      icon="bot"
      title="Hermes · агент"
      action={<span className="panel-count">{tasks.length} в работе · {totalLogs} зап.</span>}
    >
      {innerContent}
    </Card>
  );
}
