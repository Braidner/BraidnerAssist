// Общая система тостов: ToastProvider оборачивает приложение, useToast() даёт
// success/error/info. Стек справа снизу, авто-скрытие 3.5с, плоские карточки.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  CircleX,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/cn.ts";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}
interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: CircleX,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer != null) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts, { id, type, message }]);
      const timer = window.setTimeout(() => remove(id), 3500);
      timers.current.set(id, timer);
    },
    [remove],
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-viewport fixed flex w-[min(360px,calc(100vw-32px))] flex-col gap-2.5"
        aria-label="Уведомления"
      >
        {toasts.map((toast) => {
          const Icon = ICON[toast.type];
          return (
            <div
              key={toast.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-raise px-4 py-3 text-body text-ink",
                "animate-[toast-in_.22s_var(--ease)] motion-reduce:animate-none",
                toast.type === "success" && "border-ok/30",
                toast.type === "error" && "border-bad/35",
                toast.type === "info" && "border-info/30",
              )}
              role={toast.type === "error" ? "alert" : "status"}
              aria-live={toast.type === "error" ? "assertive" : "polite"}
              aria-atomic="true"
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-5 flex-none",
                  toast.type === "success" && "text-ok",
                  toast.type === "error" && "text-bad",
                  toast.type === "info" && "text-info",
                )}
              />
              <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
              <button
                type="button"
                className="-mr-1 -mt-1 grid size-8 flex-none place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 active:text-accent motion-reduce:transition-none"
                onClick={() => remove(toast.id)}
                aria-label="Закрыть уведомление"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// Безопасен вне провайдера (no-op) — компоненты не падают, если забыли обернуть.
const NOOP: ToastApi = { success: () => {}, error: () => {}, info: () => {} };
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
