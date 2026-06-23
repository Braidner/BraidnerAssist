// Cmd/Ctrl+K — палитра команд: переход между страницами, отправка команды Hermes,
// создание задачи и быстрые действия (рестарт контейнера, пауза DNS-фильтрации).
// Открывается по Cmd/Ctrl+K, Escape — закрыть. Источник навигации — NAV_ITEMS.

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./Sidebar.tsx";
import { icons } from "./icons.tsx";
import { sendHermesCommand, dockerAction, adguardProtection, unifiedSearch, addTitle, addTorrent, type DockerContainer, type AdguardData, type UnifiedSearchResult } from "../lib/api.ts";

const EMPTY_MEDIA: UnifiedSearchResult = { inLibrary: [], discover: [], releases: [] };

interface Action {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

interface Props {
  containers: DockerContainer[];
  adguard: AdguardData;
  onAddTask: (title: string) => void;
}

export function CommandPalette({ containers, adguard, onAddTask }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mediaRes, setMediaRes] = useState<UnifiedSearchResult>(EMPTY_MEDIA);
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
      setFeedback(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const close = () => setOpen(false);
  const done = (msg: string) => { setFeedback(msg); setTimeout(close, 800); };

  // Единый поиск по медиа (библиотека + discover + релизы) — с дебаунсом.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 3) { setMediaRes(EMPTY_MEDIA); return; }
    const t = setTimeout(() => { unifiedSearch(q).then(setMediaRes); }, 350);
    return () => clearTimeout(t);
  }, [query, open]);

  const navActions: Action[] = useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        id: `nav:${item.to}`,
        label: item.label,
        hint: "Перейти",
        run: () => { navigate(item.to); close(); },
      })),
    [navigate],
  );

  // Действия с Docker-контейнерами (рестарт).
  const dockerActions: Action[] = useMemo(
    () =>
      containers.map((c) => ({
        id: `docker:${c.id}`,
        label: `Перезапустить ${c.name}`,
        hint: "Docker",
        run: async () => { await dockerAction(c.id, "restart"); done(`Перезапущен ${c.name} ✓`); },
      })),
    [containers],
  );

  // Действия с AdGuard DNS (пауза/возобновление фильтрации).
  const dnsActions: Action[] = useMemo(() => {
    if (!adguard.configured) return [];
    return [
      {
        id: "dns:pause",
        label: "Приостановить DNS-фильтрацию (10 мин)",
        hint: "AdGuard",
        run: async () => { await adguardProtection(false, 600_000); done("DNS-фильтрация на паузе ✓"); },
      },
      {
        id: "dns:resume",
        label: "Включить DNS-фильтрацию",
        hint: "AdGuard",
        run: async () => { await adguardProtection(true); done("DNS-фильтрация включена ✓"); },
      },
    ];
  }, [adguard.configured]);

  const trimmed = query.trim();
  const lc = trimmed.toLowerCase();

  // С введённым текстом первыми идут «команда Hermes» и «создать задачу».
  const textActions: Action[] = trimmed
    ? [
        {
          id: "hermes:send",
          label: `Передать Hermes: «${trimmed}»`,
          hint: "Команда",
          run: async () => { await sendHermesCommand(trimmed); done("Отправлено Hermes ✓"); },
        },
        {
          id: "task:add",
          label: `Создать задачу: «${trimmed}»`,
          hint: "Задача",
          run: () => { onAddTask(trimmed); done("Задача создана ✓"); },
        },
      ]
    : [];

  // Медиа-результаты единого поиска: библиотека → detail, discover → добавить, релиз → скачать.
  const mediaActions: Action[] = [
    ...mediaRes.inLibrary.map((it) => ({
      id: `lib:${it.id}`,
      label: `${it.type === "Series" ? "📺" : "🎬"} ${it.name}${it.year ? ` (${it.year})` : ""}`,
      hint: "В библиотеке",
      run: () => { navigate(`/media/${it.type === "Series" ? "series" : "movie"}/${it.id}`); close(); },
    })),
    ...mediaRes.discover.map((it) => ({
      id: `disc:${it.kind}:${it.id}`,
      label: `+ ${it.title}${it.year ? ` (${it.year})` : ""}`,
      hint: it.kind === "movie" ? "Добавить фильм" : "Добавить сериал",
      run: async () => { const ok = await addTitle(it.kind, it.id); done(ok ? "Добавлено ✓" : "Ошибка"); },
    })),
    ...mediaRes.releases.map((r) => ({
      id: `rel:${r.guid}`,
      label: `⬇ ${r.title}`,
      hint: "Скачать",
      run: async () => { if (r.url) { const ok = await addTorrent(r.url); done(ok ? "В qBittorrent ✓" : "Ошибка"); } },
    })),
  ];

  const match = (a: Action) => !trimmed || a.label.toLowerCase().includes(lc);
  const matchedNavActions = navActions.filter(match);
  const exactNavActions = trimmed
    ? matchedNavActions.filter((a) => a.label.toLowerCase() === lc)
    : [];
  const fuzzyNavActions = exactNavActions.length > 0
    ? matchedNavActions.filter((a) => a.label.toLowerCase() !== lc)
    : matchedNavActions;
  const actions = [
    ...exactNavActions,
    ...textActions,
    ...mediaActions,
    ...dnsActions.filter(match),
    ...dockerActions.filter(match),
    ...fuzzyNavActions,
  ];
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
            placeholder="Команда, задача или страница…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSel(0); }}
            onKeyDown={onInputKey}
          />
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>esc</span>
        </div>

        {feedback ? (
          <div className="cmdk-sent">{feedback}</div>
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
