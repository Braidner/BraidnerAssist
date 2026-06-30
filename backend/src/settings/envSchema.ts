export type EnvFieldType = "text" | "secret" | "number";

export interface EnvFieldDefinition {
  key: string;
  label: string;
  type: EnvFieldType;
  runtime: boolean;
  requiresRestart?: boolean;
  serviceRecreate?: string;
}

export interface EnvGroupDefinition {
  id: string;
  title: string;
  fields: EnvFieldDefinition[];
}

export const ENV_GROUPS: EnvGroupDefinition[] = [
  {
    id: "gitlab",
    title: "GitLab",
    fields: [
      { key: "GITLAB_URL", label: "URL", type: "text", runtime: true },
      { key: "GITLAB_TOKEN", label: "Token", type: "secret", runtime: true },
      { key: "GITLAB_USER_ID", label: "User ID", type: "text", runtime: true },
    ],
  },
  {
    id: "home",
    title: "Home Assistant / Weather / Proxmox",
    fields: [
      { key: "HASS_URL", label: "HA URL", type: "text", runtime: true },
      { key: "HASS_TOKEN", label: "HA token", type: "secret", runtime: true },
      { key: "WEATHER_LAT", label: "Weather lat", type: "text", runtime: true },
      { key: "WEATHER_LON", label: "Weather lon", type: "text", runtime: true },
      { key: "PROXMOX_URL", label: "Proxmox URL", type: "text", runtime: true },
      { key: "PROXMOX_TOKEN", label: "Proxmox token", type: "secret", runtime: true },
      { key: "PROXMOX_NODE", label: "Proxmox node", type: "text", runtime: true },
    ],
  },
  {
    id: "media",
    title: "Media",
    fields: [
      { key: "JELLYFIN_URL", label: "Jellyfin URL", type: "text", runtime: true },
      { key: "JELLYFIN_API_KEY", label: "Jellyfin API key", type: "secret", runtime: true },
      { key: "QBITTORRENT_URL", label: "qBittorrent URL", type: "text", runtime: true },
      { key: "QBITTORRENT_USER", label: "qBittorrent user", type: "text", runtime: true },
      { key: "QBITTORRENT_PASSWORD", label: "qBittorrent password", type: "secret", runtime: true },
      { key: "JACKETT_URL", label: "Jackett URL", type: "text", runtime: true },
      { key: "JACKETT_API_KEY", label: "Jackett API key", type: "secret", runtime: true },
      { key: "JACKETT_INDEXERS", label: "Jackett indexers", type: "text", runtime: true },
      { key: "TORRSERVER_URL", label: "TorrServer URL", type: "text", runtime: true },
      { key: "TORRSERVER_USER", label: "TorrServer user", type: "text", runtime: true },
      { key: "TORRSERVER_PASSWORD", label: "TorrServer password", type: "secret", runtime: true },
      { key: "TMDB_API_KEY", label: "TMDB API key", type: "secret", runtime: true },
      { key: "MEDIA_ROOT", label: "Backend media root", type: "text", runtime: true },
      { key: "QBITTORRENT_SAVE_ROOT", label: "qB save root", type: "text", runtime: true },
      { key: "MEDIA_TV", label: "TV folder", type: "text", runtime: true },
      { key: "MEDIA_MOVIES", label: "Movies folder", type: "text", runtime: true },
    ],
  },
  {
    id: "services",
    title: "Services / Notifications",
    fields: [
      { key: "NTFY_URL", label: "ntfy URL", type: "secret", runtime: true },
      { key: "ADGUARD_URL", label: "AdGuard URL", type: "text", runtime: true },
      { key: "ADGUARD_USER", label: "AdGuard user", type: "text", runtime: true },
      { key: "ADGUARD_PASSWORD", label: "AdGuard password", type: "secret", runtime: true },
      { key: "DOCKER_SOCKET", label: "Docker socket", type: "text", runtime: true },
      { key: "SERVICES_FILE", label: "Services file", type: "text", runtime: true },
      { key: "HEALTH_EXPORT_PATH", label: "Health export path", type: "text", runtime: true },
    ],
  },
  {
    id: "poster-cache",
    title: "Poster cache",
    fields: [
      { key: "POSTER_CACHE_DIR", label: "Cache dir", type: "text", runtime: true },
      { key: "POSTER_CACHE_MAX_MB", label: "Max MB", type: "number", runtime: true },
      { key: "POSTER_CACHE_OBJECT_MAX_MB", label: "Object max MB", type: "number", runtime: true },
      { key: "POSTER_CACHE_TMDB_TTL_DAYS", label: "TMDB TTL days", type: "number", runtime: true },
      { key: "POSTER_CACHE_TVDB_TTL_DAYS", label: "TVDB TTL days", type: "number", runtime: true },
      { key: "POSTER_CACHE_KINOZAL_TTL_DAYS", label: "Kinozal TTL days", type: "number", runtime: true },
      { key: "POSTER_CACHE_JELLYFIN_TTL_DAYS", label: "Jellyfin TTL days", type: "number", runtime: true },
      { key: "POSTER_CACHE_CLEANUP_INTERVAL_MS", label: "Cleanup interval ms", type: "number", runtime: true },
    ],
  },
  {
    id: "polling",
    title: "Polling",
    fields: [
      { key: "POLL_SERVICES", label: "Services ms", type: "number", runtime: true },
      { key: "POLL_WEATHER", label: "Weather ms", type: "number", runtime: true },
      { key: "POLL_TASKS", label: "Tasks ms", type: "number", runtime: true },
      { key: "POLL_PROXMOX", label: "Proxmox ms", type: "number", runtime: true },
      { key: "POLL_JACKETT_HEALTH", label: "Jackett health ms", type: "number", runtime: true },
    ],
  },
  {
    id: "tokens",
    title: "Tokens / external publish",
    fields: [
      { key: "APP_TOKEN", label: "APP token", type: "secret", runtime: true },
      { key: "MCP_TOKEN", label: "MCP token", type: "secret", runtime: true },
      { key: "JWT_SECRET", label: "JWT secret", type: "secret", runtime: false, requiresRestart: true },
      { key: "CLOUDPUB_TOKEN", label: "CloudPub token", type: "secret", runtime: false, serviceRecreate: "cloudpub" },
    ],
  },
];

export const ENV_FIELD_BY_KEY = new Map(
  ENV_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field] as const)),
);

export const EDITABLE_ENV_KEYS = new Set(ENV_FIELD_BY_KEY.keys());
export const SECRET_ENV_KEYS = new Set(
  [...ENV_FIELD_BY_KEY.values()].filter((field) => field.type === "secret").map((field) => field.key),
);
