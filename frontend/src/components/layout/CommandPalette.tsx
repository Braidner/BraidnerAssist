// Cmd/Ctrl+K — палитра команд: переход между страницами, отправка команды Hermes,
// создание задачи и быстрые действия (рестарт контейнера, пауза DNS-фильтрации).
// Открывается по Cmd/Ctrl+K, Escape — закрыть. Источник навигации — NAV_ITEMS.

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./Sidebar.tsx";
import { icons } from "../icons.tsx";
import {
  sendHermesCommand,
  dockerAction,
  adguardProtection,
  unifiedSearch,
  addTitle,
  addTorrent,
  getDocker,
  getAdguard,
  type DockerData,
  type AdguardData,
  type UnifiedSearchResult,
} from "../../lib/api.ts";
import { useTasksCtx } from "../../lib/tasksContext.tsx";
import { cn } from "../../lib/cn.ts";

const EMPTY_MEDIA: UnifiedSearchResult = {
  inLibrary: [],
  discover: [],
  releases: [],
};

interface Action {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette() {
  const [docker, setDocker] = useState<DockerData>({
    configured: false,
    containers: [],
  });
  const [adguard, setAdguard] = useState<AdguardData>({
    configured: false,
    dnsQueries: 0,
    blocked: 0,
    blockedPercent: 0,
    avgProcessingMs: 0,
    topBlocked: [],
  });

  useEffect(() => {
    getDocker().then(setDocker);
    getAdguard().then(setAdguard);
    const t = setInterval(() => {
      getDocker().then(setDocker);
      getAdguard().then(setAdguard);
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  const { onAddTask } = useTasksCtx();
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
  const done = (msg: string) => {
    setFeedback(msg);
    setTimeout(close, 800);
  };

  // Единый поиск по медиа (библиотека + discover + релизы) — с дебаунсом.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 3) {
      setMediaRes(EMPTY_MEDIA);
      return;
    }
    const t = setTimeout(() => {
      unifiedSearch(q).then(setMediaRes);
    }, 350);
    return () => clearTimeout(t);
  }, [query, open]);

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

  // Действия с Docker-контейнерами (рестарт).
  const dockerActions: Action[] = useMemo(
    () =>
      docker.containers.map((c) => ({
        id: `docker:${c.id}`,
        label: `Перезапустить ${c.name}`,
        hint: "Docker",
        run: async () => {
          await dockerAction(c.id, "restart");
          done(`Перезапущен ${c.name} ✓`);
        },
      })),
    [docker.containers],
  );

  // Действия с AdGuard DNS (пауза/возобновление фильтрации).
  const dnsActions: Action[] = useMemo(() => {
    if (!adguard.configured) return [];
    return [
      {
        id: "dns:pause",
        label: "Приостановить DNS-фильтрацию (10 мин)",
        hint: "AdGuard",
        run: async () => {
          await adguardProtection(false, 600_000);
          done("DNS-фильтрация на паузе ✓");
        },
      },
      {
        id: "dns:resume",
        label: "Включить DNS-фильтрацию",
        hint: "AdGuard",
        run: async () => {
          await adguardProtection(true);
          done("DNS-фильтрация включена ✓");
        },
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
          run: async () => {
            await sendHermesCommand(trimmed);
            done("Отправлено Hermes ✓");
          },
        },
        {
          id: "task:add",
          label: `Создать задачу: «${trimmed}»`,
          hint: "Задача",
          run: () => {
            onAddTask(trimmed);
            done("Задача создана ✓");
          },
        },
      ]
    : [];

  // Медиа-результаты единого поиска: библиотека → detail, discover → добавить, релиз → скачать.
  const mediaActions: Action[] = [
    ...mediaRes.inLibrary.map((it) => ({
      id: `lib:${it.id}`,
      label: `${it.type === "Series" ? "📺" : "🎬"} ${it.name}${it.year ? ` (${it.year})` : ""}`,
      hint: "В библиотеке",
      run: () => {
        navigate(
          `/media/${it.type === "Series" ? "series" : "movie"}/${it.id}`,
        );
        close();
      },
    })),
    ...mediaRes.discover.map((it) => ({
      id: `disc:${it.kind}:${it.id}`,
      label: `+ ${it.title}${it.year ? ` (${it.year})` : ""}`,
      hint: it.kind === "movie" ? "Добавить фильм" : "Добавить сериал",
      run: async () => {
        const ok = await addTitle(it.kind, it.id);
        done(ok ? "Добавлено ✓" : "Ошибка");
      },
    })),
    ...mediaRes.releases.map((r) => ({
      id: `rel:${r.guid}`,
      label: `⬇ ${r.title}`,
      hint: "Скачать",
      run: async () => {
        if (r.url) {
          const ok = await addTorrent(r.url);
          done(ok ? "В qBittorrent ✓" : "Ошибка");
        }
      },
    })),
  ];

  const match = (a: Action) => !trimmed || a.label.toLowerCase().includes(lc);
  const matchedNavActions = navActions.filter(match);
  const exactNavActions = trimmed
    ? matchedNavActions.filter((a) => a.label.toLowerCase() === lc)
    : [];
  const fuzzyNavActions =
    exactNavActions.length > 0
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
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center bg-black/55 px-4 pb-4 pt-[14vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="flex w-[min(560px,100%)] flex-col gap-1.5 rounded-card border border-hair bg-raise p-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-3 py-2">
          <span className="ic" style={{ color: "var(--muted)" }}>
            <icons.target />
          </span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-lead text-ink outline-none placeholder:text-muted"
            placeholder="Команда, задача или страница…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={onInputKey}
          />
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--muted)" }}
          >
            esc
          </span>
        </div>

        {feedback ? (
          <div className="px-4 py-[18px] text-center text-row text-accent">
            {feedback}
          </div>
        ) : (
          <div className="scroll flex max-h-[50vh] flex-col gap-[3px]">
            {actions.length === 0 ? (
              <div className="p-4 font-mono text-xs text-muted">
                Ничего не найдено.
              </div>
            ) : (
              actions.map((a, i) => (
                <button
                  key={a.id}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border border-transparent bg-transparent px-3 py-2.5 text-left text-row text-ink transition-colors",
                    i === clampedSel &&
                      "border-accent/35 bg-accent/10 text-accent",
                  )}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => a.run()}
                >
                  <span className="min-w-0 truncate">{a.label}</span>
                  <span className="flex-none font-mono text-label uppercase tracking-2 text-muted">
                    {a.hint}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
