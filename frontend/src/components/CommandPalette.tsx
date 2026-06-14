// Cmd/Ctrl+K — палитра команд: переход между страницами + отправка команды Hermes.
// Открывается по Cmd/Ctrl+K или Escape для закрытия. Источник навигации — NAV_ITEMS.

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./Sidebar.tsx";
import { icons } from "./icons.tsx";
import { sendHermesCommand } from "../lib/api.ts";

interface Action {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Глобальный хоткей Cmd/Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Сброс при открытии.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      setSent(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const close = () => setOpen(false);

  const navActions: Action[] = useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        id: `nav:${item.to}`,
        label: item.label,
        hint: "Перейти",
        run: () => {
          navigate(item.to);
          close();
        },
      })),
    [navigate],
  );

  const trimmed = query.trim();

  // Если введён текст — первым пунктом предлагаем отправить его как команду Hermes.
  const hermesAction: Action[] = trimmed
    ? [
        {
          id: "hermes:send",
          label: `Передать Hermes: «${trimmed}»`,
          hint: "Команда",
          run: async () => {
            await sendHermesCommand(trimmed);
            setSent(true);
            setTimeout(close, 700);
          },
        },
      ]
    : [];

  const filteredNav = trimmed
    ? navActions.filter((a) => a.label.toLowerCase().includes(trimmed.toLowerCase()))
    : navActions;

  const actions = [...hermesAction, ...filteredNav];
  const clampedSel = Math.min(sel, Math.max(actions.length - 1, 0));

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, actions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      actions[clampedSel]?.run();
    }
  };

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onClick={close}>
      <div className="cmdk-panel neu" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span className="ic" style={{ color: "var(--muted)" }}><icons.target /></span>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Команда или страница…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSel(0); }}
            onKeyDown={onInputKey}
          />
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>esc</span>
        </div>

        {sent ? (
          <div className="cmdk-sent">Отправлено Hermes ✓</div>
        ) : (
          <div className="cmdk-list">
            {actions.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>Ничего не найдено.</div>
            ) : (
              actions.map((a, i) => (
                <button
                  key={a.id}
                  className={`cmdk-item ${i === clampedSel ? "active" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => a.run()}
                >
                  <span className="cmdk-item-label">{a.label}</span>
                  <span className="cmdk-item-hint mono">{a.hint}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
