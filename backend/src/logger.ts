// In-memory ring buffer for recent backend log entries.
// Survives across requests; lost on process restart (that's fine for debugging).

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  t: string;        // ISO timestamp
  level: LogLevel;
  ctx: string;      // context label, e.g. "hermes", "hass", "request"
  msg: string;
  detail?: string;  // optional extra (error stack, response body, etc.)
}

const MAX_ENTRIES = 500;
const buf: LogEntry[] = [];
const SECRET_KEY_RE = /authorization|cookie|api[_-]?key|token|password|secret/i;
const MAX_STRING_LENGTH = 1_000;

function redactString(value: string): string {
  return value
    .replace(/(bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(/([?&](?:api[_-]?key|token|password|secret|access_token)=)[^&\s"']+/gi, "$1[redacted]");
}

function shorten(value: string): string {
  const redacted = redactString(value);
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : redacted;
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (typeof value === "string") return shorten(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol" || typeof value === "function") return String(value);
  if (value instanceof Error) {
    return normalizeError(value, seen);
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_RE.test(key) ? "[redacted]" : sanitize(item, seen);
  }
  return out;
}

function normalizeError(error: Error, seen = new WeakSet<object>()): Record<string, unknown> {
  if (seen.has(error)) return { name: error.name, message: "[circular]" };
  seen.add(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(cause !== undefined ? { cause: sanitize(cause, seen) } : {}),
  };
}

function push(level: LogLevel, ctx: string, msg: string, detail?: string) {
  buf.push({ t: new Date().toISOString(), level, ctx, msg, detail });
  if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES);
}

export const log = {
  info:  (ctx: string, msg: string, detail?: string) => push("info",  ctx, msg, detail),
  warn:  (ctx: string, msg: string, detail?: string) => push("warn",  ctx, msg, detail),
  error: (ctx: string, msg: string, detail?: string) => push("error", ctx, msg, detail),
};

export function safeJsonDetail(extra: Record<string, unknown>): string {
  return JSON.stringify(sanitize(extra), null, 2);
}

export function errorDetail(e: unknown, extra?: Record<string, unknown>): string {
  const error = e instanceof Error
    ? normalizeError(e)
    : { value: String(e) };
  return safeJsonDetail(extra ? { error, extra } : { error });
}

export function getEntries(): LogEntry[] {
  return [...buf].reverse(); // newest first
}
