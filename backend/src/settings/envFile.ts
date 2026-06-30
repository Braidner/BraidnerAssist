import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface EnvLine {
  raw: string;
  key?: string;
  value?: string;
}

const KEY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

export function parseEnvText(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (parsed.key) values[parsed.key] = parsed.value ?? "";
  }
  return values;
}

export async function readEnvFile(path: string): Promise<Record<string, string>> {
  const text = await readFile(path, "utf-8").catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return "";
    throw err;
  });
  return parseEnvText(text);
}

export async function updateEnvFile(
  path: string,
  updates: Record<string, string | null>,
  allowedKeys: Set<string>,
): Promise<void> {
  const existing = await readFile(path, "utf-8").catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return "";
    throw err;
  });
  const lines = existing ? existing.split(/\r?\n/) : [];
  const hadTrailingNewline = existing.endsWith("\n");
  const seen = new Set<string>();
  const next = lines.map((raw): string => {
    const parsed = parseLine(raw);
    if (!parsed.key || !Object.prototype.hasOwnProperty.call(updates, parsed.key)) {
      return raw;
    }
    if (!allowedKeys.has(parsed.key)) throw new Error(`Env key is not editable: ${parsed.key}`);
    seen.add(parsed.key);
    return `${parsed.key}=${formatValue(updates[parsed.key] ?? "")}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!allowedKeys.has(key)) throw new Error(`Env key is not editable: ${key}`);
    if (!seen.has(key)) next.push(`${key}=${formatValue(value ?? "")}`);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, normalizeOutput(next, hadTrailingNewline), "utf-8");
}

function parseLine(raw: string): EnvLine {
  const match = raw.match(KEY_RE);
  if (!match) return { raw };
  return { raw, key: match[1], value: parseValue(match[2] ?? "") };
}

function parseValue(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"')) return parseDoubleQuoted(trimmed);
  if (trimmed.startsWith("'")) {
    const end = trimmed.indexOf("'", 1);
    return end >= 0 ? trimmed.slice(1, end) : trimmed.slice(1);
  }
  const hash = trimmed.search(/\s#/);
  return (hash >= 0 ? trimmed.slice(0, hash) : trimmed).trim();
}

function parseDoubleQuoted(input: string): string {
  let out = "";
  for (let i = 1; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"') break;
    if (ch === "\\" && i + 1 < input.length) {
      const next = input[++i];
      out += next === "n" ? "\n" : next === "r" ? "\r" : next === "t" ? "\t" : next;
    } else {
      out += ch;
    }
  }
  return out;
}

function formatValue(value: string): string {
  if (value === "") return "";
  if (/^[A-Za-z0-9_./:@,!+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function normalizeOutput(lines: string[], hadTrailingNewline: boolean): string {
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return `${lines.join("\n")}${hadTrailingNewline || lines.length > 0 ? "\n" : ""}`;
}
