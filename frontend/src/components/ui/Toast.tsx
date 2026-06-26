// Общая система тостов: ToastProvider оборачивает приложение, useToast() даёт
// success/error/info. Стек справа снизу, авто-скрытие 3.5с, плоские карточки.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

const ICON: Record<ToastType, string> = { success: "✓", error: "✕", info: "ⓘ" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts, { id, type, message }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove],
  );

  // Стабильный api (не пересоздаётся между рендерами).
  const apiRef = useRef<ToastApi>({
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  });
  apiRef.current.success = (m) => push("success", m);
  apiRef.current.error = (m) => push("error", m);
  apiRef.current.info = (m) => push("info", m);

  return (
    <ToastContext.Provider value={apiRef.current}>
      {children}
      <div className="fixed bottom-5 right-5 z-[500] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2.5 max-[760px]:bottom-4 max-[760px]:right-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-[14px] border border-hair bg-raise px-4 py-3 text-[13px] text-ink",
              "animate-[toast-in_.22s_var(--ease)]",
              t.type === "success" && "border-l-4 border-l-ok",
              t.type === "error" && "border-l-4 border-l-bad",
              t.type === "info" && "border-l-4 border-l-info",
            )}
            onClick={() => remove(t.id)}
            role="status"
          >
            <span
              className={cn(
                "grid size-5 flex-none place-items-center rounded-full text-xs font-bold",
                t.type === "success" && "bg-ok text-accent-ink",
                t.type === "error" && "bg-bad text-white",
                t.type === "info" && "bg-info text-white",
              )}
            >
              {ICON[t.type]}
            </span>
            <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Безопасен вне провайдера (no-op) — компоненты не падают, если забыли обернуть.
const NOOP: ToastApi = { success: () => {}, error: () => {}, info: () => {} };
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
