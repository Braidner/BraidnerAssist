import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getActiveUser, isUserRole, type UserRole } from "../auth/users.js";

interface TokenPayload {
  sub?: string;
  role?: string;
  uid?: string;
}

export async function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = auth.slice(7);
  // Static APP_TOKEN — для iOS Shortcuts и Hermes (не истекает).
  if (config.auth.appToken && token === config.auth.appToken) {
    res.locals.user = { id: "app-token", username: "app-token", role: "admin" satisfies UserRole };
    return next();
  }
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as TokenPayload;
    const dbUser = payload.uid ? await getActiveUser(payload.uid) : null;
    if (payload.uid && !dbUser) {
      return res.status(401).json({ error: "invalid or expired token" });
    }
    const role = dbUser
      ? isUserRole(dbUser.role) ? dbUser.role : "media"
      : isUserRole(payload.role) ? payload.role : "admin";
    res.locals.user = {
      id: dbUser?.id ?? payload.uid ?? payload.sub ?? "jwt",
      username: dbUser?.username ?? payload.sub ?? "user",
      role,
    };
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.user?.role !== "admin") {
    return res.status(403).json({ error: "admin required" });
  }
  next();
}
