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

function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 2) return "только что";
  if (diffMin < 60) return `${diffMin}м назад`;
  if (diffH < 24) return `${diffH}ч назад`;
  if (diffD === 1) return "вчера";
  if (diffD < 7) return `${diffD}д назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

interface TasksPanelProps {
  tasks: PanelTask[];
  onToggle: (t: PanelTask) => void;
  onAdd: (title: string) => void;
  onSelect: (t: PanelTask) => void;
}

export function TasksPanel({ tasks, onToggle, onAdd, onSelect }: TasksPanelProps) {
  const open = tasks.filter((t) => !t.done).length;
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

      <div
        className="scroll"
        style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}
      >
        {tasks.length === 0 && (
          <div className="empty">Нет задач. Введи название выше или создай через Hermes.</div>
        )}
        {tasks.map((t) => (
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
                {t.hermes && (
                  <span className="hermes-flag">
                    <icons.bot style={{ width: 11, height: 11 }} />
                    Hermes
                  </span>
                )}
                <span className="task-updated">{fmtUpdated(t.updatedAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
