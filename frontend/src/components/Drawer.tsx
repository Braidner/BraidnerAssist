import { useEffect, useState } from "react";
import { icons } from "./icons.tsx";
import { startHermesSession, type PanelTask } from "../lib/api.ts";

interface DrawerProps {
  task: PanelTask | null;
  onClose: () => void;
  onSessionStarted?: (id: string) => void;
}

type SendState = "idle" | "sending" | "sent" | "error";

const SEND_LABEL: Record<SendState, string> = {
  idle: "Отправить в Hermes",
  sending: "Отправляю…",
  sent: "Сессия создана",
  error: "Повторить",
};

const PRIO_LABEL: Record<string, string> = {
  bad: "Высокий",
  warn: "Средний",
  ok: "Готово",
  info: "Низкий",
};

const PRIO_COLOR: Record<string, string> = {
  bad: "var(--bad)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  info: "var(--info)",
};

export function Drawer({ task, onClose, onSessionStarted }: DrawerProps) {
  const [send, setSend] = useState<SendState>("idle");
  const [sendErrDetail, setSendErrDetail] = useState<string | null>(null);

  useEffect(() => {
    setSend("idle");
    setSendErrDetail(null);
  }, [task]);

  useEffect(() => {
    if (!task) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  const onSendToHermes = async () => {
    if (!task || send === "sending") return;
    setSend("sending");
    setSendErrDetail(null);
    try {
      const { id } = await startHermesSession({
        taskRef: task.projectRef ?? task.id,
        title: task.label,
        description: task.descriptionText ?? "",
      });
      setSend("sent");
      onSessionStarted?.(id);
    } catch (e) {
      setSend("error");
      setSendErrDetail(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      {/* overlay */}
      <div
        className={`drawer-overlay ${task ? "open" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      {/* panel */}
      <aside className={`drawer neu ${task ? "open" : ""}`} aria-label="Детали задачи">
        {task && (
          <div className="drawer-inner">
            <div className="drawer-head">
              <div className="drawer-kind">
                {task.kind === "mr" ? (
                  <icons.git style={{ width: 14, height: 14 }} />
                ) : (
                  <icons.list style={{ width: 14, height: 14 }} />
                )}
                <span>{task.kind === "mr" ? "Merge Request" : "Issue"}</span>
                {task.projectRef && (
                  <span className="drawer-ref">{task.projectRef}</span>
                )}
              </div>
              <button className="icon-btn" onClick={onClose} title="Закрыть">
                <icons.close style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <h2 className="drawer-title">{task.label}</h2>

            <div className="drawer-meta">
              {task.prio && (
                <span className="drawer-badge" style={{ borderColor: PRIO_COLOR[task.prio], color: PRIO_COLOR[task.prio] }}>
                  {PRIO_LABEL[task.prio] ?? task.prio}
                </span>
              )}
              {task.labels?.map((lbl) => (
                <span key={lbl} className="tag">{lbl}</span>
              ))}
            </div>

            {task.branchInfo && (
              <div className="drawer-field">
                <span className="drawer-field-label">Ветка</span>
                <span className="drawer-field-value mono">{task.branchInfo}</span>
              </div>
            )}

            {task.dueDate && (
              <div className="drawer-field">
                <span className="drawer-field-label">Дедлайн</span>
                <span className="drawer-field-value">{new Date(task.dueDate).toLocaleDateString("ru-RU")}</span>
              </div>
            )}

            {task.descriptionText ? (
              <div className="drawer-desc scroll">{task.descriptionText}</div>
            ) : (
              <div className="drawer-desc empty">Описание отсутствует.</div>
            )}

            {task.webUrl && (
              <a
                className="drawer-open-btn neu-sm"
                href={task.webUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть в GitLab
                <icons.external style={{ width: 13, height: 13 }} />
              </a>
            )}

            <button
              className="drawer-open-btn drawer-send-btn neu-sm"
              onClick={onSendToHermes}
              disabled={send === "sending"}
            >
              {SEND_LABEL[send]}
              <icons.bot style={{ width: 14, height: 14 }} />
            </button>
            {send === "error" && sendErrDetail && (
              <div className="drawer-send-error">{sendErrDetail}</div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
