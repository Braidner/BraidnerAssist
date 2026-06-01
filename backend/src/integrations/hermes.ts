import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { log } from "../logger.js";

export interface HermesSession {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
}

export interface HermesSessionsData {
  configured: boolean;
  sessions: HermesSession[];
}

export interface HermesMessage {
  role: "user" | "assistant";
  text: string;
}

export interface HermesSessionDetail {
  id: string;
  title: string;
  status: string;
  messages: HermesMessage[];
  error?: string;
}

interface VllmResponse {
  id: string;
  status: string;
  output: Array<{
    type: string;
    role?: string;
    content?: Array<{ type: string; text: string }>;
  }>;
}

const LLM_TIMEOUT_MS = 120_000; // 2 min — prevents silent hangs behind nginx

function inferHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.hermes.key) h["Authorization"] = `Bearer ${config.hermes.key}`;
  return h;
}

function extractText(resp: VllmResponse): string {
  for (const item of resp.output) {
    if (item.type === "message" && item.role === "assistant" && item.content) {
      const block = item.content.find((c) => c.type === "output_text");
      if (block?.text) return block.text;
    }
  }
  return "";
}

async function callLlm(input: string, previousId?: string): Promise<VllmResponse> {
  const body: Record<string, unknown> = {
    model: config.hermes.model,
    input,
    store: true,
  };
  if (previousId) body["previous_response_id"] = previousId;

  log.info("hermes", `LLM call → model=${config.hermes.model}${previousId ? ` prev=${previousId}` : ""}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${config.hermes.url}/v1/responses`, {
      method: "POST",
      headers: inferHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    log.error("hermes", `LLM fetch failed: ${msg}`);
    throw new Error(`LLM unreachable: ${msg}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error("hermes", `LLM HTTP ${res.status}`, text.slice(0, 300));
    throw new Error(`LLM error ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
  }

  const data = (await res.json()) as VllmResponse;
  log.info("hermes", `LLM OK → response_id=${data.id}`);
  return data;
}

function parseMsgs(raw: string): HermesMessage[] {
  try {
    return JSON.parse(raw) as HermesMessage[];
  } catch {
    return [];
  }
}

export async function listSessions(): Promise<HermesSessionsData> {
  if (!config.hermes.configured) return { configured: false, sessions: [] };
  const rows = await prisma.hermesSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return {
    configured: true,
    sessions: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function startSession(input: string): Promise<{ id: string }> {
  if (!config.hermes.configured) throw new Error("Hermes not configured");

  const titleSnippet = input.split("\n")[0].slice(0, 80);
  log.info("hermes", `startSession: "${titleSnippet}"`);

  const session = await prisma.hermesSession.create({
    data: {
      title: titleSnippet,
      status: "running",
      messages: JSON.stringify([{ role: "user", text: input }]),
    },
  });

  let resp: VllmResponse;
  try {
    resp = await callLlm(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("hermes", `startSession failed: ${msg}`, `session=${session.id}`);
    await prisma.hermesSession.update({
      where: { id: session.id },
      data: { status: "error" },
    });
    throw e;
  }

  const assistantText = extractText(resp);
  const messages: HermesMessage[] = [
    { role: "user", text: input },
    ...(assistantText ? [{ role: "assistant" as const, text: assistantText }] : []),
  ];

  await prisma.hermesSession.update({
    where: { id: session.id },
    data: {
      latestResponseId: resp.id,
      messages: JSON.stringify(messages),
      status: "idle",
    },
  });

  log.info("hermes", `startSession done: session=${session.id}`);
  return { id: session.id };
}

export async function sendTurn(sessionId: string, input: string): Promise<void> {
  if (!config.hermes.configured) throw new Error("Hermes not configured");

  const session = await prisma.hermesSession.findUniqueOrThrow({ where: { id: sessionId } });
  const messages = parseMsgs(session.messages);

  log.info("hermes", `sendTurn: session=${sessionId}`);

  await prisma.hermesSession.update({
    where: { id: sessionId },
    data: { status: "running" },
  });

  let resp: VllmResponse;
  try {
    resp = await callLlm(input, session.latestResponseId ?? undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("hermes", `sendTurn failed: ${msg}`, `session=${sessionId}`);
    await prisma.hermesSession.update({
      where: { id: sessionId },
      data: { status: "error" },
    });
    throw e;
  }

  const assistantText = extractText(resp);
  const updated: HermesMessage[] = [
    ...messages,
    { role: "user", text: input },
    ...(assistantText ? [{ role: "assistant" as const, text: assistantText }] : []),
  ];

  await prisma.hermesSession.update({
    where: { id: sessionId },
    data: {
      latestResponseId: resp.id,
      messages: JSON.stringify(updated),
      status: "idle",
    },
  });

  log.info("hermes", `sendTurn done: session=${sessionId}`);
}

export async function getSession(id: string): Promise<HermesSessionDetail> {
  const session = await prisma.hermesSession.findUniqueOrThrow({ where: { id } });
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    messages: parseMsgs(session.messages),
  };
}
