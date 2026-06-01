import { useEffect, useRef, useState } from "react";
import { icons } from "./icons.tsx";
import { getHermesSession, sendHermesMessage, type HermesSessionDetail } from "../lib/api.ts";

interface HermesChatProps {
  sessionId: string | null;
  onClose: () => void;
}

export function HermesChat({ sessionId, onClose }: HermesChatProps) {
  const [detail, setDetail] = useState<HermesSessionDetail | null>(null);
  const [error, setError] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      setError(false);
      setInput("");
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const d = await getHermesSession(sessionId);
        if (!alive) return;
        setDetail(d);
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    };

    load();
    timer = setInterval(load, 5000);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || !sessionId || sending) return;
    setSending(true);
    setSendError(null);
    const result = await sendHermesMessage(sessionId, text);
    if (result.ok) {
      setInput("");
      setDetail((d) =>
        d ? { ...d, status: "running", messages: [...d.messages, { role: "user", text }] } : d,
      );
      try {
        setDetail(await getHermesSession(sessionId));
      } catch {
        /* поллинг подтянет */
      }
    } else {
      setSendError(result.error ?? "Ошибка отправки");
    }
    setSending(false);
  };

  return (
    <>
      <div
        className={`drawer-overlay ${sessionId ? "open" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      <aside className={`drawer neu ${sessionId ? "open" : ""}`} aria-label="Чат сессии Hermes">
        {sessionId && (
          <div className="drawer-inner hermes-chat">
            <div className="drawer-head">
              <div className="drawer-kind">
                <icons.bot style={{ width: 14, height: 14 }} />
                <span>{detail?.title ?? "Сессия"}</span>
                {detail && <span className="drawer-ref">{detail.status}</span>}
              </div>
              <button className="icon-btn" onClick={onClose} title="Закрыть">
                <icons.close style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div className="chat-feed scroll">
              {error && <div className="empty">Не удалось загрузить сессию.</div>}
              {!error && !detail && <div className="empty">Загрузка…</div>}
              {!error && detail && detail.messages.length === 0 && (
                <div className="empty">Сообщений пока нет.</div>
              )}
              {detail?.messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  {m.text}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input">
              {sendError && (
                <div className="chat-error">{sendError}</div>
              )}
              <div className="chat-input-row">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Сообщение Hermes…"
                  rows={2}
                />
                <button
                  className="drawer-open-btn neu-sm"
                  onClick={onSend}
                  disabled={sending || !input.trim()}
                >
                  {sending ? "…" : "Отправить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
