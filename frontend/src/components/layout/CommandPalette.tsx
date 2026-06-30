// Cmd/Ctrl+K — палитра команд: переход между страницами, отправка команды Hermes,
// создание задачи и быстрые действия (рестарт контейнера, пауза DNS-фильтрации).
// Открывается по Cmd/Ctrl+K, Escape — закрыть. Источник навигации — NAV_ITEMS.

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./Sidebar.tsx";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  sendHermesCommand,
  dockerAction,
  adguardProtection,
  unifiedSearch,
  addTitle,
  addTorrent,
  getDocker,
  getAdguard,
  getMediaPreferences,
  type DockerData,
  type AdguardData,
  type UnifiedSearchResult,
  type MediaPreference,
} from "../../lib/api.ts";
import { useTasksCtx } from "../../lib/tasksContext.tsx";
import type { UserRole } from "@/lib/auth";

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

export function CommandPalette({ role }: { role: UserRole }) {
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
    if (role !== "admin") return;
    getDocker().then(setDocker);
    getAdguard().then(setAdguard);
    const t = setInterval(() => {
      getDocker().then(setDocker);
      getAdguard().then(setAdguard);
    }, 30_000);
    return () => clearInterval(t);
  }, [role]);
  const { onAddTask } = useTasksCtx();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mediaRes, setMediaRes] = useState<UnifiedSearchResult>(EMPTY_MEDIA);
  const [watchlist, setWatchlist] = useState<MediaPreference[]>([]);

  // Глобальный хоткей Cmd/Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Сброс при открытии.
  useEffect(() => {
    if (open) {
      setQuery("");
      setFeedback(null);
      getMediaPreferences("watchlist").then(setWatchlist);
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
      NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map(
        (item) => ({
          id: `nav:${item.to}`,
          label: item.label,
          hint: "Перейти",
          run: () => {
            navigate(item.to);
            close();
          },
        }),
      ),
    [navigate, role],
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
  const textActions: Action[] = role === "admin" && trimmed
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
    ...watchlist
      .filter((it) => !trimmed || it.title.toLowerCase().includes(lc))
      .map((it) => ({
        id: `watch:${it.kind}:${it.tmdbId}`,
        label: `Мой список: ${it.title}${it.year ? ` (${it.year})` : ""}`,
        hint: it.kind === "movie" ? "Фильм" : "Сериал",
        run: async () => {
          navigate(`/media/${it.kind === "movie" ? "movie" : "series"}/${it.tmdbId}`);
          close();
        },
      })),
    ...mediaRes.inLibrary.map((it) => ({
      id: `lib:${it.id}`,
      label: `${it.type === "Series" ? "📺" : "🎬"} ${it.name}${it.year ? ` (${it.year})` : ""}`,
      hint: "В библиотеке",
      run: () => {
        navigate(
          it.tmdbId
            ? `/media/${it.type === "Series" ? "series" : "movie"}/${it.tmdbId}`
            : `/media/jellyfin/${it.type === "Series" ? "series" : "movie"}/${it.id}`,
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
    ...(role === "admin" ? dnsActions.filter(match) : []),
    ...(role === "admin" ? dockerActions.filter(match) : []),
    ...fuzzyNavActions,
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Командная палитра"
      description="Команда, задача или страница"
      className="sm:max-w-[560px]"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Команда, задача или страница…"
        />
        <CommandList>
          {feedback ? (
            <div className="px-4 py-[18px] text-center text-row text-accent">
              {feedback}
            </div>
          ) : (
            <>
              <CommandEmpty>Ничего не найдено.</CommandEmpty>
              {actions.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.id}
                  onSelect={() => a.run()}
                  className="justify-between gap-2.5"
                >
                  <span className="min-w-0 truncate">{a.label}</span>
                  <span className="flex-none font-mono text-label uppercase tracking-2 text-muted">
                    {a.hint}
                  </span>
                </CommandItem>
              ))}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
