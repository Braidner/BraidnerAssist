// Интеграция с Docker Engine API через unix-сокет (undici Client + socketPath).
// Фича строго opt-in: docker.sock не монтируется и DOCKER_SOCKET не задан — блок
// показывает «Not configured». Доступ к docker.sock = root-эквивалент на хосте.

import { Client } from "undici";
import { config } from "../config.js";

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;   // running | exited | paused | ...
  status: string;  // человекочитаемый статус из Docker
}

const ALLOWED_ACTIONS = new Set(["start", "stop", "restart"]);

let client: Client | null = null;
let cache: { data: DockerContainer[]; at: number } | null = null;

function getClient(): Client {
  if (!client && config.docker.socket) {
    client = new Client("http://localhost", { socketPath: config.docker.socket });
  }
  if (!client) throw new Error("Docker не настроен");
  return client;
}

interface DockerRawContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}

export async function getContainers(): Promise<{ configured: boolean; containers: DockerContainer[] }> {
  if (!config.docker.configured) return { configured: false, containers: [] };

  // Возвращаем кеш если он свежий (30с)
  if (cache && Date.now() - cache.at < 30_000) {
    return { configured: true, containers: cache.data };
  }

  const c = getClient();
  const { body, statusCode } = await c.request({
    path: "/containers/json?all=1",
    method: "GET",
  });
  if (statusCode !== 200) {
    const text = await body.text();
    throw new Error(`Docker API ответил ${statusCode}: ${text}`);
  }
  const raw = (await body.json()) as DockerRawContainer[];
  const containers: DockerContainer[] = raw.map((r) => ({
    id: r.Id.slice(0, 12),
    name: (r.Names[0] ?? r.Id).replace(/^\//, ""),
    image: r.Image,
    state: r.State,
    status: r.Status,
  }));
  cache = { data: containers, at: Date.now() };
  return { configured: true, containers };
}

export async function containerAction(id: string, action: string): Promise<void> {
  if (!config.docker.configured) throw new Error("Docker не настроен");
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Недопустимое действие: ${action}. Разрешены: start, stop, restart`);
  }
  const c = getClient();
  const { statusCode, body } = await c.request({
    path: `/containers/${encodeURIComponent(id)}/${action}`,
    method: "POST",
  });
  await body.dump(); // читаем body, чтобы не утечь соединение
  // 204 = успех, 304 = нет изменений (контейнер уже запущен/остановлен) — оба ок
  if (statusCode !== 204 && statusCode !== 304) {
    throw new Error(`Docker API ответил ${statusCode} на ${action} для ${id}`);
  }
  // Инвалидируем кеш после успешной операции
  cache = null;
}
