import type { IconName } from "../components/icons.tsx";

// Статический мок из дизайн-бандла (mc-data.js). Заменяется реальными
// интеграциями в фазах 2–3 (Apple Health → habits, homelab → services).

export interface Habit {
  id: string;
  name: string;
  val: string;
  pct: number;
  week: number[];
  icon: IconName;
}

export interface Service {
  name: string;
  status: "ok" | "warn" | "bad";
  tag: string;
}

export interface Resource {
  label: string;
  num: string;
  pct: number;
}

export interface Note {
  text: string;
  time: string;
}

export const habits: Habit[] = [
  {
    id: "sleep",
    name: "Сон",
    val: "7ч 12м / 8ч",
    pct: 90,
    week: [1, 1, 0, 1, 1, 1, 0],
    icon: "moon",
  },
  {
    id: "sport",
    name: "Активность",
    val: "2 / 4 трен.",
    pct: 50,
    week: [1, 0, 1, 0, 0, 1, 0],
    icon: "dumbbell",
  },
  {
    id: "water",
    name: "Вода",
    val: "1.6 / 2.5 л",
    pct: 64,
    week: [1, 1, 1, 0, 1, 1, 0],
    icon: "drop",
  },
  {
    id: "focus",
    name: "Фокус-блоки",
    val: "3 / 5 блоков",
    pct: 60,
    week: [1, 1, 1, 0, 1, 0, 0],
    icon: "target",
  },
];

export const services: Service[] = [
  { name: "pultra-api", status: "ok", tag: "up · 14d 6h" },
  { name: "pultra-web", status: "ok", tag: "up · 14d 6h" },
  { name: "hermes-mcp-server", status: "ok", tag: "up · 3h 22m" },
  { name: "sqlite (prisma)", status: "ok", tag: "WAL · 41 MB" },
  { name: "nginx-proxy", status: "ok", tag: "up · 31d" },
  { name: "backup-cron", status: "warn", tag: "next 02:00" },
];

export const resources: Resource[] = [
  { label: "CPU", num: "23%", pct: 23 },
  { label: "RAM", num: "5.1 / 8 GB", pct: 64 },
  { label: "DISK", num: "37 / 120 GB", pct: 31 },
];

export const initialNotes: Note[] = [
  {
    text: "Идея: Hermes должен сам триажить инбокс утром в 06:00",
    time: "сегодня 05:51",
  },
  {
    text: "Проверить латентность MCP при stdio vs HTTP под нагрузкой",
    time: "вчера 22:08",
  },
  { text: "Купить термопасту для домашнего сервера", time: "вчера 19:30" },
];
