import { useEffect, useState } from "react";
import { Bot, ExternalLink, GitBranch, List } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { sendHermesCommand } from "../../lib/api.ts";
import { useTasksCtx } from "../../lib/tasksContext.tsx";

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
  const { selectedTask: task, clearSelection } = useTasksCtx();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  // сбросить состояние при смене задачи
  useEffect(() => {
    setSent(false);
    setSending(false);
  }, [task?.id]);

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
    <Sheet open={!!task} onOpenChange={(o) => !o && clearSelection()}>
      <SheetContent className="flex w-[min(420px,92vw)] flex-col gap-0">
        {task && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-[7px] font-mono text-pill text-muted">
                {task.kind === "mr" ? (
                  <GitBranch className="size-3.5" />
                ) : (
                  <List className="size-3.5" />
                )}
                <span>{task.kind === "mr" ? "Merge Request" : "Issue"}</span>
                {task.projectRef && (
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-data text-muted">
                    {task.projectRef}
                  </span>
                )}
              </div>
              <SheetTitle className="text-base leading-snug text-ink">
                {task.label}
              </SheetTitle>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6">
              <div className="mb-4 flex flex-wrap gap-1.5">
                {task.prio && (
                  <span
                    className="rounded-md border px-2 py-0.5 font-mono text-data"
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
                <div className="flex items-baseline gap-2.5 border-t border-hair py-2 text-cell">
                  <span className="min-w-[70px] text-muted">Ветка</span>
                  <span className="font-mono text-ink-soft">
                    {task.branchInfo}
                  </span>
                </div>
              )}

              {task.dueDate && (
                <div className="flex items-baseline gap-2.5 border-t border-hair py-2 text-cell">
                  <span className="min-w-[70px] text-muted">Дедлайн</span>
                  <span className="text-ink-soft">
                    {new Date(task.dueDate).toLocaleDateString("ru-RU")}
                  </span>
                </div>
              )}

              {task.descriptionText ? (
                <div className="scroll mt-3.5 max-h-[280px] whitespace-pre-wrap break-words rounded-xl border border-hair bg-surface-2 p-3.5 text-body leading-relaxed text-ink-soft">
                  {task.descriptionText}
                </div>
              ) : (
                <div className="mt-3.5 rounded-xl border border-hair bg-surface-2 p-3.5 font-mono text-xs text-muted">
                  Описание отсутствует.
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2.5">
                <Button
                  className="w-full"
                  onClick={handleSendHermes}
                  disabled={sending || sent}
                >
                  <Bot />
                  {sent ? "Отправлено" : sending ? "…" : "Передать Hermes"}
                </Button>
                {task.webUrl && (
                  <Button asChild className="w-full">
                    <a href={task.webUrl} target="_blank" rel="noreferrer">
                      Открыть в GitLab
                      <ExternalLink />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
