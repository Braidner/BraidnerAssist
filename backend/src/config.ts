// Централизованная runtime-конфигурация. Значения берутся из process.env и
// read-write env-файла, смонтированного в backend-контейнер как ENV_FILE_PATH.

import { readFileSync } from "node:fs";
import { parseEnvText } from "./settings/envFile.js";

function baseEnv(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const ENV_FILE_PATH = baseEnv("ENV_FILE_PATH") ?? "/app/.env.runtime";

let runtimeEnv: Record<string, string> = loadRuntimeEnv();

function env(key: string): string | undefined {
  const override = runtimeEnv[key];
  if (override !== undefined) return override.trim() !== "" ? override.trim() : undefined;
  return baseEnv(key);
}

function num(key: string, fallback: number): number {
  const v = env(key);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function loadRuntimeEnv(): Record<string, string> {
  try {
    return parseEnvText(readFileSync(ENV_FILE_PATH, "utf-8"));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw err;
  }
}

export function getEffectiveEnvValue(key: string): string | undefined {
  return env(key);
}

export function reloadConfig(opts: { preserveKeys?: string[] } = {}): AppConfig {
  const previous = new Map((opts.preserveKeys ?? []).map((key) => [key, env(key)]));
  runtimeEnv = loadRuntimeEnv();
  for (const [key, value] of previous) {
    if (value !== undefined) runtimeEnv[key] = value;
    else delete runtimeEnv[key];
  }
  currentConfig = buildConfig();
  return currentConfig;
}

export function getConfig(): AppConfig {
  return currentConfig;
}

function buildConfig() {
  const nodeEnv = env("NODE_ENV") ?? "development";
  return {
    backendPort: num("BACKEND_PORT", 3001),
    nodeEnv,
    mcpToken: env("MCP_TOKEN"),

    auth: {
      jwtSecret: env("JWT_SECRET") ?? "mc-dev-secret-change-in-prod",
      // Статический токен для iOS Shortcuts / Hermes (не истекает).
      appToken: env("APP_TOKEN"),
    },

    gitlab: {
      url: env("GITLAB_URL"),
      token: env("GITLAB_TOKEN"),
      userId: env("GITLAB_USER_ID"),
      get configured() {
        return Boolean(this.url && this.token && this.userId);
      },
    },

    hass: {
      url: env("HASS_URL"),
      token: env("HASS_TOKEN"),
      get configured() {
        return Boolean(this.url && this.token);
      },
    },

    weather: {
      lat: env("WEATHER_LAT"),
      lon: env("WEATHER_LON"),
      get configured() {
        return Boolean(this.lat && this.lon);
      },
    },

    proxmox: {
      url: env("PROXMOX_URL"),
      token: env("PROXMOX_TOKEN"),
      node: env("PROXMOX_NODE"),
      get configured() {
        return Boolean(this.url && this.token);
      },
    },

    caldav: {
      url: env("CALDAV_URL"),
      username: env("CALDAV_USERNAME"),
      password: env("CALDAV_PASSWORD"),
      get configured() {
        return Boolean(this.url && this.username && this.password);
      },
    },

    docker: {
      socket: env("DOCKER_SOCKET"),
      get configured() { return Boolean(this.socket); },
    },

    notify: {
      ntfyUrl: env("NTFY_URL"),
      get configured() { return Boolean(this.ntfyUrl); },
    },

    adguard: {
      url: env("ADGUARD_URL"),
      username: env("ADGUARD_USER"),
      password: env("ADGUARD_PASSWORD"),
      get configured() {
        return Boolean(this.url && this.username && this.password);
      },
    },

    media: {
      jellyfin: {
        url: env("JELLYFIN_URL"),
        apiKey: env("JELLYFIN_API_KEY"),
        get configured() { return Boolean(this.url && this.apiKey); },
      },
      qbittorrent: {
        url: env("QBITTORRENT_URL"),
        username: env("QBITTORRENT_USER"),
        password: env("QBITTORRENT_PASSWORD"),
        get configured() { return Boolean(this.url && this.username && this.password); },
      },
      jackett: {
        url: env("JACKETT_URL"),
        apiKey: env("JACKETT_API_KEY"),
        indexers: env("JACKETT_INDEXERS") ?? "all",
        get configured() { return Boolean(this.url && this.apiKey); },
      },
      torrserver: {
        url: env("TORRSERVER_URL"),
        username: env("TORRSERVER_USER"),
        password: env("TORRSERVER_PASSWORD"),
        get configured() { return Boolean(this.url); },
      },
      tmdb: {
        apiKey: env("TMDB_API_KEY"),
        get configured() { return Boolean(this.apiKey); },
      },
      get configured() {
        return (
          this.jellyfin.configured ||
          this.qbittorrent.configured ||
          this.jackett.configured ||
          this.torrserver.configured ||
          this.tmdb.configured
        );
      },
    },

    mediaFs: {
      root: env("MEDIA_ROOT") ?? (nodeEnv === "production" ? "/media" : "data"),
      qbittorrentRoot: env("QBITTORRENT_SAVE_ROOT") ?? "/data",
      tv: env("MEDIA_TV") ?? "tv",
      movies: env("MEDIA_MOVIES") ?? "movies",
      get configured() { return Boolean(this.root); },
    },

    servicesFile: env("SERVICES_FILE") ?? (nodeEnv === "production" ? "/data/services.json" : "data/services.json"),

    health: {
      exportPath: env("HEALTH_EXPORT_PATH") ?? "/data/health/export.xml",
    },

    posterCache: {
      dir: env("POSTER_CACHE_DIR") ?? "/data/poster-cache",
      maxBytes: num("POSTER_CACHE_MAX_MB", 5120) * 1024 * 1024,
      objectMaxBytes: num("POSTER_CACHE_OBJECT_MAX_MB", 20) * 1024 * 1024,
      tmdbTtlMs: num("POSTER_CACHE_TMDB_TTL_DAYS", 90) * 86_400_000,
      tvdbTtlMs: num("POSTER_CACHE_TVDB_TTL_DAYS", 90) * 86_400_000,
      kinozalTtlMs: num("POSTER_CACHE_KINOZAL_TTL_DAYS", 30) * 86_400_000,
      jellyfinTtlMs: num("POSTER_CACHE_JELLYFIN_TTL_DAYS", 7) * 86_400_000,
      cleanupIntervalMs: num("POSTER_CACHE_CLEANUP_INTERVAL_MS", 3_600_000),
    },

    poll: {
      services: num("POLL_SERVICES", 60_000),
      weather: num("POLL_WEATHER", 1_800_000),
      tasks: num("POLL_TASKS", 300_000),
      proxmox: num("POLL_PROXMOX", 30_000),
      jackettHealth: num("POLL_JACKETT_HEALTH", 300_000),
    },
  };
}

let currentConfig = buildConfig();

export type AppConfig = ReturnType<typeof buildConfig>;

export const config = new Proxy({} as AppConfig, {
  get(_target, prop: keyof AppConfig) {
    return currentConfig[prop];
  },
  ownKeys() {
    return Reflect.ownKeys(currentConfig);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(currentConfig, prop);
  },
});
