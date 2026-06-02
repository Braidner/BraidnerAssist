import { useRef, useState } from "react";
import { Card } from "../Card.tsx";
import { icons } from "../icons.tsx";
import { fmtUpdated } from "../../lib/format.ts";
import type { PanelTask, Prio } from "../../lib/api.ts";

const PRIO_VAR: Record<Prio, string> = {
  bad: "var(--bad)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  info: "var(--info)",
};

interface TasksPanelProps {
  tasks: PanelTask[];
  onToggle: (t: PanelTask) => void;
  onAdd: (title: string) => void;
  onSelect: (t: PanelTask) => void;
  onDelete: (t: PanelTask) => void;
}

export function TasksPanel({ tasks, onToggle, onAdd, onSelect, onDelete }: TasksPanelProps) {
  const open = tasks.filter((t) => !t.done).length;
  const [showDone, setShowDone] = useState(false);
  const visible = showDone ? tasks : tasks.filter((t) => !t.done);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = draft.trim();
    if (!t) return;
    onAdd(t);
    setDraft("");
    inputRef.current?.focus();
  }

  return (
    <Card
      icon="list"
      title="Задачи"
      action={
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
          {open} активн.
        </span>
      }
    >
      {/* persistent quick-add input */}
      <form onSubmit={submit} className="note-input" style={{ marginBottom: 16 }}>
        <input
          ref={inputRef}
          placeholder="$ новая задача…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="icon-btn" type="submit" aria-label="Добавить">
          <icons.plus style={{ width: 16, height: 16 }} />
        </button>
      </form>

      <div className="logs-filter" style={{ marginBottom: 10 }}>
        <button
          className={`pill logs-pill${!showDone ? " active" : ""}`}
          onClick={() => setShowDone(false)}
        >
          Активные
        </button>
        <button
          className={`pill logs-pill${showDone ? " active" : ""}`}
          onClick={() => setShowDone(true)}
        >
          Все
        </button>
      </div>

      <div
        className="scroll"
        style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}
      >
        {visible.length === 0 && (
          <div className="empty">
            {tasks.length === 0
              ? "Нет задач. Введи название выше или создай через Hermes."
              : "Нет активных задач — все выполнены."}
          </div>
        )}
        {visible.map((t) => (
          <div
            key={t.id}
            className={`task ${t.done ? "done" : ""}`}
            onClick={() => onSelect(t)}
            style={{ opacity: t.tag === "gitlab" ? (t.done ? 0.5 : 0.85) : undefined, cursor: "pointer" }}
          >
            <span
              className="checkbox"
              role="checkbox"
              aria-checked={t.done}
              onClick={(e) => { e.stopPropagation(); onToggle(t); }}
            >
              <icons.check />
            </span>
            <div className="task-body">
              <div className="task-label">{t.label}</div>
              <div className="task-meta">
                <span className="prio" style={{ background: PRIO_VAR[t.prio] }} />
                <span className="tag">{t.tag}</span>
                {t.claimedBy === "hermes" && (
                  <span className="hermes-flag">
                    <icons.bot style={{ width: 11, height: 11 }} />
                    Hermes
                  </span>
                )}
                <span className="task-updated">{fmtUpdated(t.updatedAt)}</span>
              </div>
            </div>
            {t.tag === "local" && (
              <button
                className="task-del"
                title="Удалить задачу"
                aria-label="Удалить задачу"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Удалить задачу «${t.label}»?`)) onDelete(t);
                }}
              >
                <icons.trash style={{ width: 15, height: 15 }} />
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
