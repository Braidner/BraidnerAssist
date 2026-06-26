import { useEffect, useState } from "react";
import { icons } from "../icons.tsx";
import { sendHermesCommand } from "../../lib/api.ts";
import { useTasksCtx } from "../../lib/tasksContext.tsx";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";

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

export function Drawer() {
  const { selectedTask: task, clearSelection: onClose } = useTasksCtx();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  // сбросить состояние при смене задачи
  useEffect(() => {
    setSent(false);
    setSending(false);
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  async function handleSendHermes() {
    if (!task || sending || sent) return;
    setSending(true);
    const ok = await sendHermesCommand("work_task", {
      taskId: task.id,
      title: task.label,
      description: task.descriptionText ?? null,
    });
    setSending(false);
    if (ok) setSent(true);
  }

  return (
    <>
      {/* overlay */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-40 bg-black/0 transition-colors duration-200",
          task && "pointer-events-auto bg-black/40",
        )}
        onClick={onClose}
        aria-hidden
      />
      {/* panel */}
      <aside
        className={cn(
          "fixed bottom-0 right-0 top-0 z-50 w-[min(420px,92vw)] translate-x-full overflow-hidden rounded-l-card border-l border-hair bg-raise transition-transform duration-300",
          task && "translate-x-0",
        )}
        aria-label="Детали задачи"
      >
        {task && (
          <div className="flex h-full flex-col overflow-y-auto px-[22px] pb-7 pt-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-[7px] font-mono text-[11.5px] text-muted">
                {task.kind === "mr" ? (
                  <icons.git style={{ width: 14, height: 14 }} />
                ) : (
                  <icons.list style={{ width: 14, height: 14 }} />
                )}
                <span>{task.kind === "mr" ? "Merge Request" : "Issue"}</span>
                {task.projectRef && (
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                    {task.projectRef}
                  </span>
                )}
              </div>
              <button className={ui.iconButton} onClick={onClose} title="Закрыть">
                <icons.close style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <h2 className="mb-3.5 text-base font-semibold leading-snug text-ink">
              {task.label}
            </h2>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {task.prio && (
                <span
                  className="rounded-md border px-2 py-0.5 font-mono text-[11px]"
                  style={{
                    borderColor: PRIO_COLOR[task.prio],
                    color: PRIO_COLOR[task.prio],
                  }}
                >
                  {PRIO_LABEL[task.prio] ?? task.prio}
                </span>
              )}
              {task.labels?.map((lbl) => (
                <span key={lbl} className="tag">
                  {lbl}
                </span>
              ))}
            </div>

            {task.branchInfo && (
              <div className="flex items-baseline gap-2.5 border-t border-hair py-2 text-[12.5px]">
                <span className="min-w-[70px] text-muted">Ветка</span>
                <span className="font-mono text-ink-soft">
                  {task.branchInfo}
                </span>
              </div>
            )}

            {task.dueDate && (
              <div className="flex items-baseline gap-2.5 border-t border-hair py-2 text-[12.5px]">
                <span className="min-w-[70px] text-muted">Дедлайн</span>
                <span className="text-ink-soft">
                  {new Date(task.dueDate).toLocaleDateString("ru-RU")}
                </span>
              </div>
            )}

            {task.descriptionText ? (
              <div className="scroll mt-3.5 max-h-[280px] flex-1 whitespace-pre-wrap break-words rounded-xl border border-hair bg-surface-2 p-3.5 text-[13px] leading-relaxed text-ink-soft">
                {task.descriptionText}
              </div>
            ) : (
              <div className="mt-3.5 rounded-xl border border-hair bg-surface-2 p-3.5 font-mono text-xs text-muted">
                Описание отсутствует.
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                className={cn(ui.button.base, ui.button.accent, "w-full")}
                onClick={handleSendHermes}
                disabled={sending || sent}
              >
                <icons.bot style={{ width: 13, height: 13 }} />
                {sent ? "Отправлено" : sending ? "…" : "Передать Hermes"}
              </button>
              {task.webUrl && (
                <a
                  className={cn(ui.button.base, ui.button.accent, "w-full no-underline")}
                  href={task.webUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть в GitLab
                  <icons.external style={{ width: 13, height: 13 }} />
                </a>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
