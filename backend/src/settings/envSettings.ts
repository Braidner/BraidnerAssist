import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { ENV_FILE_PATH, getEffectiveEnvValue, reloadConfig } from "../config.js";
import { invalidateAdguardCache } from "../integrations/adguard.js";
import { resetDockerIntegration } from "../integrations/docker.js";
import { invalidateGitLabCache } from "../integrations/gitlab.js";
import { invalidateHomeAssistantCache } from "../integrations/homeassistant.js";
import { invalidateJackettHealthCache } from "../integrations/jackett.js";
import { invalidateMediaCache } from "../integrations/media.js";
import { restartPosterCacheCleanup } from "../integrations/posterCache.js";
import { invalidateProxmoxCache } from "../integrations/proxmox.js";
import { invalidateServicesCache } from "../integrations/services.js";
import { invalidateWeatherCache } from "../integrations/weather.js";
import { restartSampler } from "../sampler.js";
import { readEnvFile, updateEnvFile } from "./envFile.js";
import {
  EDITABLE_ENV_KEYS,
  ENV_FIELD_BY_KEY,
  ENV_GROUPS,
  SECRET_ENV_KEYS,
  type EnvFieldDefinition,
} from "./envSchema.js";

export interface EnvSettingsResponse {
  envFilePath: string;
  writable: boolean;
  groups: Array<{
    id: string;
    title: string;
    fields: EnvFieldResponse[];
  }>;
}

export interface EnvFieldResponse extends EnvFieldDefinition {
  value: string;
  hasValue: boolean;
  maskedValue?: string;
}

export interface EnvUpdateResult {
  applied: boolean;
  requiresRestart: string[];
  requiresServiceRecreate: string[];
  warnings: string[];
}

const DEFAULT_ENV_VALUES: Record<string, string> = {
  POSTER_CACHE_DIR: "/data/poster-cache",
  POSTER_CACHE_MAX_MB: "5120",
  POSTER_CACHE_OBJECT_MAX_MB: "20",
  POSTER_CACHE_TMDB_TTL_DAYS: "90",
  POSTER_CACHE_TVDB_TTL_DAYS: "90",
  POSTER_CACHE_KINOZAL_TTL_DAYS: "30",
  POSTER_CACHE_JELLYFIN_TTL_DAYS: "7",
  POSTER_CACHE_CLEANUP_INTERVAL_MS: "3600000",
};

export async function getEnvSettings(): Promise<EnvSettingsResponse> {
  const writable = await canWriteEnvFile();
  return {
    envFilePath: ENV_FILE_PATH,
    writable,
    groups: ENV_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      fields: group.fields.map(fieldResponse),
    })),
  };
}

export async function updateEnvSettings(input: unknown): Promise<EnvUpdateResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("object expected");
  }
  const values = (input as { values?: unknown }).values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("values object expected");
  }

  const updates: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(values as Record<string, unknown>)) {
    const field = ENV_FIELD_BY_KEY.get(key);
    if (!field) throw new Error(`Env key is not editable: ${key}`);
    if (typeof rawValue !== "string") throw new Error(`Env value must be string: ${key}`);
    const value = rawValue.trim();
    if (field.type === "number" && value && !Number.isFinite(Number(value))) {
      throw new Error(`Env value must be numeric: ${key}`);
    }
    updates[key] = value;
  }

  await updateEnvFile(ENV_FILE_PATH, updates, EDITABLE_ENV_KEYS);

  const requiresRestart = Object.entries(updates)
    .filter(([key]) => ENV_FIELD_BY_KEY.get(key)?.requiresRestart)
    .map(([key]) => key);
  const requiresServiceRecreate = [
    ...new Set(
      Object.entries(updates)
        .map(([key]) => ENV_FIELD_BY_KEY.get(key)?.serviceRecreate)
        .filter(Boolean) as string[],
    ),
  ];

  reloadConfig({ preserveKeys: requiresRestart });
  resetRuntimeState();

  const warnings: string[] = [];
  if (requiresRestart.length > 0) {
    warnings.push(`${requiresRestart.join(", ")} сохранены в .env и вступят в силу после restart backend.`);
  }
  if (requiresServiceRecreate.length > 0) {
    warnings.push(`Нужно пересоздать сервисы: ${requiresServiceRecreate.join(", ")}.`);
  }

  return {
    applied: true,
    requiresRestart,
    requiresServiceRecreate,
    warnings,
  };
}

function fieldResponse(field: EnvFieldDefinition): EnvFieldResponse {
  const raw = getEffectiveEnvValue(field.key) ?? DEFAULT_ENV_VALUES[field.key] ?? "";
  const hasValue = raw.trim() !== "";
  if (SECRET_ENV_KEYS.has(field.key)) {
    return {
      ...field,
      value: "",
      hasValue,
      maskedValue: hasValue ? maskSecret(raw) : "",
    };
  }
  return { ...field, value: raw, hasValue };
}

async function canWriteEnvFile(): Promise<boolean> {
  try {
    await access(ENV_FILE_PATH, constants.W_OK);
    return true;
  } catch {
    try {
      await access(ENV_FILE_PATH, constants.F_OK);
      return false;
    } catch {
      return true;
    }
  }
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "******";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

function resetRuntimeState(): void {
  invalidateGitLabCache();
  invalidateHomeAssistantCache();
  invalidateWeatherCache();
  invalidateProxmoxCache();
  invalidateAdguardCache();
  invalidateServicesCache();
  invalidateMediaCache();
  invalidateJackettHealthCache();
  resetDockerIntegration();
  restartSampler();
  restartPosterCacheCleanup();
}

export async function readEditableEnvValues(): Promise<Record<string, string>> {
  const values = await readEnvFile(ENV_FILE_PATH);
  return Object.fromEntries(Object.entries(values).filter(([key]) => EDITABLE_ENV_KEYS.has(key)));
}
