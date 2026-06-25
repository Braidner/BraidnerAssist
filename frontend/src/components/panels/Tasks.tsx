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
  flat?: boolean;
}

export function TasksPanel({ tasks, onToggle, onAdd, onSelect, onDelete, flat }: TasksPanelProps) {
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

  if (flat) {
    return (
      <div className="fcard" style={{ padding: 16 }}>
        <div className="ov-sec">
          <span className="ov-sec-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span className="ov-sec-label">Задачи</span>
          <span className="ov-sec-count">{open} активных</span>
        </div>
        <form onSubmit={submit} className="task-input">
          <div className="fld neu-in">
            <input
              ref={inputRef}
              placeholder="$ новая задача…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <button className="addbtn" type="submit" aria-label="Добавить">
            <icons.plus style={{ width: 20, height: 20 }} />
          </button>
        </form>
        <div className="filters">
          <button className={`fchip ${!showDone ? "on" : ""}`} onClick={() => setShowDone(false)}>Активные</button>
          <button className={`fchip ${showDone ? "on" : ""}`} onClick={() => setShowDone(true)}>Все</button>
        </div>
        <div className="tlist scroll" style={{ flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}>
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
              className={`titem ${t.done ? "done" : ""}`}
              onClick={() => onSelect(t)}
              style={{ opacity: t.tag === "gitlab" ? (t.done ? 0.5 : 0.85) : undefined }}
            >
              <span
                className="cbx"
                role="checkbox"
                aria-checked={t.done}
                onClick={(e) => { e.stopPropagation(); onToggle(t); }}
              >
                <icons.check />
              </span>
              <div className="tbody">
                <div className="tlabel">{t.label}</div>
                <div className="tmeta">
                  <span className="prio" style={{ background: PRIO_VAR[t.prio] }} />
                  <span className="tag">
                    {t.tag === "gitlab" && <span className="gd" style={{ background: "var(--pink)" }} />}
                    {t.tag}
                  </span>
                  {t.claimedBy === "hermes" && (
                    <span className="hflag">
                      <icons.bot style={{ width: 11, height: 11 }} />
                      Hermes
                    </span>
                  )}
                  <span className="twhen">{fmtUpdated(t.updatedAt)}</span>
                </div>
              </div>
              {t.tag === "local" && (
                <button
                  className="tdel"
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
      </div>
    );
  }

  return (
    <Card
      icon="list"
      title="Задачи"
      action={<span className="panel-count">{open} активн.</span>}
    >
      <form onSubmit={submit} className="task-input">
        <div className="fld neu-in">
          <input
            ref={inputRef}
            placeholder="$ новая задача…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <button className="addbtn" type="submit" aria-label="Добавить">
          <icons.plus style={{ width: 20, height: 20 }} />
        </button>
      </form>

      <div className="filters">
        <button className={`fchip ${!showDone ? "on" : ""}`} onClick={() => setShowDone(false)}>Активные</button>
        <button className={`fchip ${showDone ? "on" : ""}`} onClick={() => setShowDone(true)}>Все</button>
      </div>

      <div className="tlist scroll" style={{ flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}>
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
            className={`titem ${t.done ? "done" : ""}`}
            onClick={() => onSelect(t)}
            style={{ opacity: t.tag === "gitlab" ? (t.done ? 0.5 : 0.85) : undefined }}
          >
            <span
              className="cbx"
              role="checkbox"
              aria-checked={t.done}
              onClick={(e) => { e.stopPropagation(); onToggle(t); }}
            >
              <icons.check />
            </span>
            <div className="tbody">
              <div className="tlabel">{t.label}</div>
              <div className="tmeta">
                <span className="prio" style={{ background: PRIO_VAR[t.prio] }} />
                <span className="tag">
                  {t.tag === "gitlab" && <span className="gd" style={{ background: "var(--pink)" }} />}
                  {t.tag}
                </span>
                {t.claimedBy === "hermes" && (
                  <span className="hflag">
                    <icons.bot style={{ width: 11, height: 11 }} />
                    Hermes
                  </span>
                )}
                <span className="twhen">{fmtUpdated(t.updatedAt)}</span>
              </div>
            </div>
            {t.tag === "local" && (
              <button
                className="tdel"
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
