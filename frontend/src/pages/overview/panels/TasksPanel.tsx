import { useRef, useState } from "react";
import { Card } from "../../../components/ui/Card.tsx";
import { icons } from "../../../components/icons.tsx";
import { fmtUpdated } from "../../../lib/format.ts";
import type { Prio } from "../../../lib/api.ts";
import { useTasksCtx } from "../../../lib/tasksContext.tsx";
import { cn } from "../../../lib/cn.ts";
import { ui } from "../../../lib/ui.ts";

const PRIO_VAR: Record<Prio, string> = {
  bad: "var(--bad)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  info: "var(--info)",
};

export function TasksPanel() {
  const {
    tasks,
    onToggleTask: onToggle,
    onAddTask: onAdd,
    onSelectTask: onSelect,
    onDeleteTask: onDelete,
  } = useTasksCtx();
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
      action={<span className={ui.panelCount}>{open} активн.</span>}
    >
      <form onSubmit={submit} className="mb-3.5 flex items-stretch gap-2">
        <input
          ref={inputRef}
          className={cn(ui.input, "flex-1 font-mono placeholder:text-muted")}
          placeholder="$ новая задача…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          className={cn(ui.button.base, ui.button.icon, "text-accent")}
          type="submit"
          aria-label="Добавить"
        >
          <icons.plus className="size-[18px]" />
        </button>
      </form>

      <div className={cn(ui.seg, "mb-3")}>
        <button
          type="button"
          className={cn(ui.segButton, !showDone && ui.segButtonOn)}
          aria-pressed={!showDone}
          onClick={() => setShowDone(false)}
        >
          Активные
        </button>
        <button
          type="button"
          className={cn(ui.segButton, showDone && ui.segButtonOn)}
          aria-pressed={showDone}
          onClick={() => setShowDone(true)}
        >
          Все
        </button>
      </div>

      <div
        className="scroll flex min-h-0 flex-1 flex-col pr-1.5"
        style={{ flex: 1, minHeight: 0, marginRight: -6, paddingRight: 6 }}
      >
        {visible.length === 0 && (
          <div className="py-2.5 font-mono text-xs text-ink-soft">
            {tasks.length === 0
              ? "Нет задач. Введи название выше или создай через Hermes."
              : "Нет активных задач — все выполнены."}
          </div>
        )}
        {visible.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex cursor-pointer items-start gap-3 border-t border-hair px-1 py-3.5 transition-colors hover:bg-surface/60",
              t.done && "opacity-55",
            )}
            onClick={() => onSelect(t)}
            style={{
              opacity: t.tag === "gitlab" ? (t.done ? 0.5 : 0.85) : undefined,
            }}
          >
            <span
              className={cn(
                "mt-0.5 grid size-[22px] flex-none cursor-pointer place-items-center rounded-md border border-hair bg-surface text-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                t.done && "border-accent/50 bg-accent text-accent-ink",
              )}
              role="checkbox"
              tabIndex={0}
              aria-checked={t.done}
              aria-label={t.label}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(t);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(t);
                }
              }}
            >
              <icons.check className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-row font-medium text-ink",
                  t.done && "text-muted line-through",
                )}
              >
                {t.label}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-label text-muted">
                <span
                  className="size-2 rounded-full"
                  style={{ background: PRIO_VAR[t.prio] }}
                />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-2.5 py-0.5">
                  {t.tag === "gitlab" && (
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: "var(--pink)" }}
                    />
                  )}
                  {t.tag}
                </span>
                {t.claimedBy === "hermes" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-accent">
                    <icons.bot className="size-[11px]" />
                    Hermes
                  </span>
                )}
                <span>{fmtUpdated(t.updatedAt)}</span>
              </div>
            </div>
            {t.tag === "local" && (
              <button
                className="grid size-8 flex-none place-items-center rounded-lg border border-transparent text-muted opacity-0 transition-opacity hover:border-bad/35 hover:text-bad focus-visible:opacity-100 group-hover:opacity-100"
                title="Удалить задачу"
                aria-label="Удалить задачу"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Удалить задачу «${t.label}»?`)) onDelete(t);
                }}
              >
                <icons.trash className="size-[15px]" />
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
