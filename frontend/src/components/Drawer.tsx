import { useEffect } from "react";
import { icons } from "./icons.tsx";
import type { PanelTask } from "../lib/api.ts";

interface DrawerProps {
  task: PanelTask | null;
  onClose: () => void;
}

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

export function Drawer({ task, onClose }: DrawerProps) {
  useEffect(() => {
    if (!task) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

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
          </div>
        )}
      </aside>
    </>
  );
}
