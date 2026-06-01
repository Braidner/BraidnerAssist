import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = auth.slice(7);
  // Static APP_TOKEN — для iOS Shortcuts и Hermes (не истекает).
  if (config.auth.appToken && token === config.auth.appToken) {
    return next();
  }
  try {
    jwt.verify(token, config.auth.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
