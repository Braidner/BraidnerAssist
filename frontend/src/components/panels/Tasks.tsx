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
}

// Задачи · Today — реальные локальные задачи (данные/toggle живут в App).
export function TasksPanel({ tasks, onToggle }: TasksPanelProps) {
  const open = tasks.filter((t) => !t.done).length;

  return (
    <Card
      icon="list"
      title="Задачи · Today"
      className="grow"
      action={<span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{open} активн.</span>}
    >
      <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}>
        {tasks.length === 0 && <div className="empty">Нет задач. Создайте через API или Hermes.</div>}
        {tasks.map((t) => (
          <div key={t.id} className={`task ${t.done ? "done" : ""}`} onClick={() => onToggle(t)}>
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
