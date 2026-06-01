import { Router } from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { config } from "../config.js";

// session map: id → transport (each session gets its own McpServer instance)
const sessions = new Map<string, StreamableHTTPServerTransport>();

function mcpAuth(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  if (!config.mcpToken) return next(); // no token configured → open (dev only)
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ") || auth.slice(7) !== config.mcpToken) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function originGuard(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const origin = req.header("origin");
  // Block requests with a browser-style Origin header that isn't localhost/LAN
  // (DNS-rebinding protection as required by MCP spec)
  if (origin) {
    try {
      const { hostname } = new URL(origin);
      const allowed = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".lan") || hostname.endsWith(".local");
      if (!allowed) return res.status(403).json({ error: "forbidden origin" });
    } catch {
      return res.status(400).json({ error: "invalid origin" });
    }
  }
  next();
}

export const mcpRouter = Router();
mcpRouter.use(originGuard, mcpAuth);

mcpRouter.post("/", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport) {
    // fresh server + transport per session — McpServer can only be connected once
    const server = createMcpServer();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport!);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

mcpRouter.get("/", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = sessions.get(sessionId);
  if (!transport) return res.status(404).json({ error: "session not found" });
  await transport.handleRequest(req, res);
});

mcpRouter.delete("/", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = sessions.get(sessionId);
  if (!transport) return res.status(404).json({ error: "session not found" });
  await transport.handleRequest(req, res);
  sessions.delete(sessionId);
});
