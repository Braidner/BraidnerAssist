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

export const config = {
  backendPort: num("BACKEND_PORT", 3001),
  nodeEnv: env("NODE_ENV") ?? "development",
  mcpToken: env("MCP_TOKEN"),

  auth: {
    user: env("AUTH_USER") ?? "braidner",
    // bcrypt hash of default password "Pk0qflvby!"
    passwordHash: env("AUTH_PASSWORD_HASH") ?? "$2b$10$e7soZessyEaSqsCVB3tAc.uHMPOqPAo7wQvBs765ozxzq0L3dfZG.",
    jwtSecret: env("JWT_SECRET") ?? "mc-dev-secret-change-in-prod",
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

  caldav: {
    url: env("CALDAV_URL"),
    username: env("CALDAV_USERNAME"),
    password: env("CALDAV_PASSWORD"),
    get configured() {
      return Boolean(this.url && this.username && this.password);
    },
  },

  servicesFile: env("SERVICES_FILE") ?? "/data/services.json",

  health: {
    exportPath: env("HEALTH_EXPORT_PATH") ?? "/data/health/export.xml",
  },

  poll: {
    services: num("POLL_SERVICES", 60_000),
    weather: num("POLL_WEATHER", 1_800_000),
    tasks: num("POLL_TASKS", 300_000),
  },
};

export type AppConfig = typeof config;
