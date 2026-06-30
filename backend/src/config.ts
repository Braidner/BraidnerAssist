// Централизованная конфигурация из env. Каждая интеграция считается
// "configured" только если заданы её обязательные переменные.

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function num(key: string, fallback: number): number {
  const v = env(key);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const nodeEnv = env("NODE_ENV") ?? "development";

export const config = {
  backendPort: num("BACKEND_PORT", 3001),
  nodeEnv,
  mcpToken: env("MCP_TOKEN"),

  auth: {
    user: env("AUTH_USER") ?? "braidner",
    passwordHash: env("AUTH_PASSWORD_HASH") ?? "$2b$10$e7soZessyEaSqsCVB3tAc.uHMPOqPAo7wQvBs765ozxzq0L3dfZG.",
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
    url: env("PROXMOX_URL"), // https://192.168.x.x:8006
    token: env("PROXMOX_TOKEN"), // user@realm!tokenid=secret
    node: env("PROXMOX_NODE"), // опционально; если пусто — берём первый online-нод
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
    socket: env("DOCKER_SOCKET"), // напр. /var/run/docker.sock
    get configured() { return Boolean(this.socket); },
  },

  notify: {
    ntfyUrl: env("NTFY_URL"), // напр. https://ntfy.sh/<your-secret-topic>
    get configured() { return Boolean(this.ntfyUrl); },
  },

  // AdGuard Home — DNS-статистика (запросы/блокировки). Basic auth.
  adguard: {
    url: env("ADGUARD_URL"), // напр. http://host.docker.internal:8053
    username: env("ADGUARD_USER"),
    password: env("ADGUARD_PASSWORD"),
    get configured() {
      return Boolean(this.url && this.username && this.password);
    },
  },

  // Медиа-стек: Jellyfin (каталог/плеер) + qBittorrent + Jackett/TorrServer/TMDB.
  // Каждый источник опционален; панель "configured" если задан хотя бы один.
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
    // TorrServer (YouROK) — мгновенный стриминг магнетов без полной загрузки.
    // Auth опционален (LAN); basic при заданных USER/PASSWORD.
    torrserver: {
      url: env("TORRSERVER_URL"), // напр. http://host.docker.internal:8090
      username: env("TORRSERVER_USER"),
      password: env("TORRSERVER_PASSWORD"),
      get configured() { return Boolean(this.url); },
    },
    // TMDB — метаданные/дискавери напрямую (Media v2). Бесплатный API-ключ (v3).
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

  // MEDIA_ROOT — корень медиатеки внутри backend-контейнера; файл-браузер
  // заперт в этом корне. QBITTORRENT_SAVE_ROOT — тот же каталог, но как его
  // видит qBittorrent-контейнер при torrents/add savepath.
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

  poll: {
    services: num("POLL_SERVICES", 60_000),
    weather: num("POLL_WEATHER", 1_800_000),
    tasks: num("POLL_TASKS", 300_000),
    proxmox: num("POLL_PROXMOX", 30_000),
    jackettHealth: num("POLL_JACKETT_HEALTH", 300_000),
  },
};

export type AppConfig = typeof config;
