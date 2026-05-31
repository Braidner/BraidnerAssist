import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  ) {
    return res.status(400).json({ error: "username and password required" });
  }

  if (username !== config.auth.user) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const ok = await bcrypt.compare(password, config.auth.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const token = jwt.sign({ sub: username }, config.auth.jwtSecret, {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
  });

  res.json({ token });
});
