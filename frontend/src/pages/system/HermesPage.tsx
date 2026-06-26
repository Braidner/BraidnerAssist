import { useState, useEffect, useRef } from "react";
import { Card } from "../../components/ui/Card.tsx";
import { fmtUpdated } from "../../lib/format.ts";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";
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
  if (status === "done") return "bg-ok";
  if (status === "active" || status === "in_progress") return "bg-accent";
  if (status === "error") return "bg-bad";
  return "bg-muted";
}

function StatusHeader({ data }: { data: HermesData }) {
  const statusColor = cmdLed(data.status);
  return (
    <div className="flex items-center gap-2.5 rounded-card border border-hair bg-raise px-4 py-3">
      <span className={cn("size-2.5 rounded-full", statusColor)} />
      <span className="font-mono text-cell text-ink-soft">
        статус: <b className="font-bold text-accent">{data.status}</b>
        {data.message ? ` · ${data.message}` : ""}
      </span>
    </div>
  );
}

function ActivityFeed({ log }: { log: PanelLogLine[] }) {
  return (
    <Card icon="bot" title="Активность · глобальный фид">
      <div className="scroll" style={{ maxHeight: 320 }}>
        {log.length === 0 && (
          <div className="py-2.5 font-mono text-xs text-muted">
            Нет записей в логе.
          </div>
        )}
        {log.map((l, i) => (
          <div key={i} className="grid grid-cols-[58px_1fr] gap-2 border-t border-hair py-2.5">
            <span className="font-mono text-label text-muted">{l.t}</span>
            <div>
              <div className="text-cell leading-snug text-ink-soft">
                {l.msg}
              </div>
              <span className="k">{l.k}</span>{" "}
              <span className="font-mono text-label text-muted/80">
                · {l.tag}
              </span>
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
      <form
        onSubmit={handleSend}
        className="mb-3.5 flex gap-3"
        style={{ marginBottom: 14 }}
      >
        <div className="flex flex-1 items-center rounded-[14px] border border-hair bg-surface px-4">
          <input
            ref={inputRef}
            className="w-full bg-transparent py-[13px] font-mono text-body text-ink outline-none placeholder:text-muted disabled:opacity-50"
            placeholder="$ команда Hermes…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
        </div>
        <button
          className={cn(ui.button.base, ui.button.icon, "h-[50px] w-[50px] rounded-2xl text-accent")}
          type="submit"
          aria-label="Отправить"
          disabled={sending}
        >
          →
        </button>
      </form>

      <div className="flex flex-col">
        {commands.length === 0 && (
          <div className="py-2.5 font-mono text-xs text-muted">
            Очередь команд пуста.
          </div>
        )}
        {commands.map((c) => (
          <div key={c.id} className="grid grid-cols-[10px_1fr] items-center gap-3 border-t border-hair px-1 py-3">
            <span className={cn("size-2 rounded-full", cmdLed(c.status))} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="truncate text-row font-medium text-ink">
                {c.command}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-data text-muted">
                <span className="text-accent">{c.status}</span>
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
  const [data, setData] = useState<HermesData>({
    status: "idle",
    message: null,
    log: [],
  });
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
    <div className="flex flex-1 flex-col gap-5">
      <StatusHeader data={data} />

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-[22px] max-[900px]:grid-cols-1">
        <div className="flex flex-col gap-5">
          <ActivityFeed log={data.log} />
          <CommandConsole />
        </div>

        <div className="flex flex-col gap-5">
          <Card
            icon="bot"
            title="Задачи Hermes"
            action={
              <span className={ui.panelCount}>
                {tasks.length} · {totalLogs} зап.
              </span>
            }
          >
            <div className="flex flex-col">
              {tasks.length === 0 && (
                <div className="py-2.5 font-mono text-xs text-muted">
                  Hermes пока не взял задач в работу.
                </div>
              )}
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[10px_1fr_auto] items-center gap-3 border-t border-hair px-1 py-3"
                  style={{ cursor: "default" }}
                >
                  <span
                    className={cn("size-2 rounded-full", cmdLed(t.status))}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="truncate text-row font-medium text-ink">
                      {t.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-data text-muted">
                      <span className="text-accent">{t.status}</span>
                      {t.claimedAt && (
                        <span>· взято {fmtUpdated(t.claimedAt)}</span>
                      )}
                      {t.lastActivity && (
                        <span>· активность {fmtUpdated(t.lastActivity)}</span>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full border border-hair bg-surface px-2 py-0.5 font-mono text-label text-muted">
                    {t.logCount}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
