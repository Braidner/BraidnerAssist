import { useState, useEffect, useRef } from "react";
import { Card } from "../../components/ui/Card.tsx";
import { fmtUpdated } from "../../lib/format.ts";
import {
  getHermes,
  getHermesTasks,
  getHermesCommands,
  sendHermesCommand,
  type HermesData,
  type HermesTask,
  type HermesCommand,
  type PanelLogLine,
} from "../../lib/api.ts";

// LED-класс по статусу AgentTask
function cmdLed(status: string): string {
  if (status === "done") return "done";
  if (status === "active") return "work";
  if (status === "error") return "error";
  return "todo";
}

function StatusHeader({ data }: { data: HermesData }) {
  const statusClass = data.status === "active" ? "busy" : data.status === "error" ? "error" : "";
  return (
    <div className={`ag-status ${statusClass}`}>
      <span className="ag-pulse" />
      <span className="ag-txt">
        статус: <b>{data.status}</b>
        {data.message ? ` · ${data.message}` : ""}
      </span>
    </div>
  );
}

function ActivityFeed({ log }: { log: PanelLogLine[] }) {
  return (
    <Card icon="bot" title="Активность · глобальный фид">
      <div className="scroll" style={{ maxHeight: 320 }}>
        {log.length === 0 && <div className="empty">Нет записей в логе.</div>}
        {log.map((l, i) => (
          <div key={i} className="log-line">
            <span className="log-t">{l.t}</span>
            <div>
              <div className="log-msg">{l.msg}</div>
              <span className="k">{l.k}</span>{" "}
              <span className="log-tag">· {l.tag}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CommandConsole() {
  const [commands, setCommands] = useState<HermesCommand[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getHermesCommands().then(setCommands);
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const cmd = draft.trim();
    if (!cmd || sending) return;
    setSending(true);
    const created = await sendHermesCommand(cmd);
    setSending(false);
    if (created) {
      setCommands((prev) => [created, ...prev]);
      setDraft("");
      inputRef.current?.focus();
    }
  }

  return (
    <Card icon="server" title="Командная консоль">
      <form onSubmit={handleSend} className="task-input" style={{ marginBottom: 14 }}>
        <div className="fld neu-in">
          <input
            ref={inputRef}
            placeholder="$ команда Hermes…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
        </div>
        <button className="addbtn" type="submit" aria-label="Отправить" disabled={sending}>
          →
        </button>
      </form>

      <div className="ag-list">
        {commands.length === 0 && (
          <div className="empty">Очередь команд пуста.</div>
        )}
        {commands.map((c) => (
          <div key={c.id} className="ag-row" style={{ cursor: "default" }}>
            <span className={`ag-led ${cmdLed(c.status)}`} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ag-l">{c.command}</div>
              <div className="ag-m">
                <span className="st">{c.status}</span>
                <span>· {fmtUpdated(c.createdAt)}</span>
                {c.result && <span>· {c.result}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// /hermes — полная страница: статус + фид + командная консоль + задачи в работе.
export function HermesPage() {
  const [data, setData] = useState<HermesData>({ status: "idle", message: null, log: [] });
  const [tasks, setTasks] = useState<HermesTask[]>([]);

  useEffect(() => {
    getHermes().then(setData);
    getHermesTasks().then(setTasks);
    const t = setInterval(() => {
      getHermes().then(setData);
      getHermesTasks().then(setTasks);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const totalLogs = tasks.reduce((s, t) => s + t.logCount, 0);

  return (
    <div className="page">
      <StatusHeader data={data} />

      <div className="page-cols">
        <div className="page-col-main">
          <ActivityFeed log={data.log} />
          <CommandConsole />
        </div>

        <div className="page-col-side">
          <Card
            icon="bot"
            title="Задачи Hermes"
            action={<span className="panel-count">{tasks.length} · {totalLogs} зап.</span>}
          >
            <div className="ag-list">
              {tasks.length === 0 && (
                <div className="empty">Hermes пока не взял задач в работу.</div>
              )}
              {tasks.map((t) => (
                <div key={t.id} className="ag-row" style={{ cursor: "default" }}>
                  <span className={`ag-led ${t.status === "done" ? "done" : t.status === "in_progress" ? "work" : "todo"}`} />
                  <div style={{ minWidth: 0 }}>
                    <div className="ag-l">{t.title}</div>
                    <div className="ag-m">
                      <span className="st">{t.status}</span>
                      {t.claimedAt && <span>· взято {fmtUpdated(t.claimedAt)}</span>}
                      {t.lastActivity && <span>· активность {fmtUpdated(t.lastActivity)}</span>}
                    </div>
                  </div>
                  <span className="ag-n">{t.logCount}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
