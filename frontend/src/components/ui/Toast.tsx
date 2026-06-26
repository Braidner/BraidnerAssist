// Общая система тостов: ToastProvider оборачивает приложение, useToast() даёт
// success/error/info. Стек справа снизу, авто-скрытие 3.5с, неоморфные карточки.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

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
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast neu toast-${t.type}`} onClick={() => remove(t.id)} role="status">
            <span className="toast-icon">{ICON[t.type]}</span>
            <span className="toast-msg">{t.message}</span>
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
