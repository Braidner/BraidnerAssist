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

const MAX_ENTRIES = 200;
const buf: LogEntry[] = [];

function push(level: LogLevel, ctx: string, msg: string, detail?: string) {
  buf.push({ t: new Date().toISOString(), level, ctx, msg, detail });
  if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES);
}

export const log = {
  info:  (ctx: string, msg: string, detail?: string) => push("info",  ctx, msg, detail),
  warn:  (ctx: string, msg: string, detail?: string) => push("warn",  ctx, msg, detail),
  error: (ctx: string, msg: string, detail?: string) => push("error", ctx, msg, detail),
};

export function getEntries(): LogEntry[] {
  return [...buf].reverse(); // newest first
}
