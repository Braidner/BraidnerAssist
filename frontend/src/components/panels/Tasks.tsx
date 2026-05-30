import { useRef, useState } from "react";
import { Card } from "../Card.tsx";
import { icons } from "../icons.tsx";
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
}

export function TasksPanel({ tasks, onToggle, onAdd }: TasksPanelProps) {
  const open = tasks.filter((t) => !t.done).length;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startAdding() {
    setAdding(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (t) { onAdd(t); setDraft(""); setAdding(false); }
  }

  function cancel() {
    setDraft("");
    setAdding(false);
  }

  return (
    <Card
      icon="list"
      title="Задачи · Today"
      className="grow"
      action={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{open} активн.</span>
          <button
            className="icon-btn"
            title="Добавить задачу"
            onClick={startAdding}
            style={{ padding: 4 }}
          >
            <icons.plus style={{ width: 14, height: 14 }} />
          </button>
        </div>
      }
    >
      {adding && (
        <form onSubmit={submit} style={{ marginBottom: 8, display: "flex", gap: 6 }}>
          <input
            ref={inputRef}
            className="note-input"
            style={{ flex: 1, fontSize: 13 }}
            placeholder="Название задачи…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cancel()}
          />
          <button className="icon-btn" type="submit" style={{ padding: 4 }}>
            <icons.check style={{ width: 14, height: 14 }} />
          </button>
        </form>
      )}
      <div
        className="scroll"
        style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}
      >
        {tasks.length === 0 && !adding && (
          <div className="empty">Нет задач. Нажми + или создай через Hermes.</div>
        )}
        {tasks.map((t) => (
          <div
            key={t.id}
            className={`task ${t.done ? "done" : ""}`}
            onClick={() => onToggle(t)}
            style={{ opacity: t.tag === "gitlab" ? (t.done ? 0.5 : 0.85) : undefined }}
          >
            <span className="checkbox"><icons.check /></span>
            <div className="task-body">
              <div className="task-label">{t.label}</div>
              <div className="task-meta">
                <span className="prio" style={{ background: PRIO_VAR[t.prio] }} />
                <span className="tag">{t.tag}</span>
                {t.hermes && (
                  <span className="hermes-flag">
                    <icons.bot style={{ width: 11, height: 11 }} />
                    Hermes
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
