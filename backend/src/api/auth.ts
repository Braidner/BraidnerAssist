import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { jwtAuth } from "../middleware/jwtAuth.js";
import {
  createPendingUser,
  createFirstAdmin,
  getActiveUser,
  hasUsers,
  refreshUserJellyfinTokenOnLogin,
  toPublicUser,
  verifyUserCredentials,
} from "../auth/users.js";

export const authRouter = Router();

function issueToken(user: { id: string; username: string; role: string }) {
  return jwt.sign(
    { sub: user.username, uid: user.id, role: user.role },
    config.auth.jwtSecret,
    { expiresIn: 60 * 60 * 24 * 30 },
  );
}

authRouter.get("/setup-status", async (_req, res) => {
  res.json({ setupRequired: !(await hasUsers()) });
});

authRouter.post("/setup", async (req, res) => {
  const { username, password, displayName } = req.body ?? {};
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  ) {
    return res.status(400).json({ error: "username and password required" });
  }

  try {
    const user = await createFirstAdmin({ username, password, displayName });
    const token = issueToken(user);
    res.status(201).json({ token, user });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

authRouter.post("/register", async (req, res) => {
  const { username, password, displayName } = req.body ?? {};
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password
  ) {
    return res.status(400).json({ error: "username and password required" });
  }
  if (!(await hasUsers())) {
    return res.status(409).json({ error: "initial setup required", setupRequired: true });
  }

  try {
    const user = await createPendingUser({ username, password, displayName });
    res.status(201).json({
      status: "pending",
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

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

  if (!(await hasUsers())) {
    return res.status(409).json({ setupRequired: true });
  }

  const user = await verifyUserCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  if (user.approvalStatus === "pending") {
    return res.status(403).json({ error: "approval pending", code: "APPROVAL_PENDING" });
  }
  if (!user.active) {
    return res.status(403).json({ error: "user disabled", code: "USER_DISABLED" });
  }
  await refreshUserJellyfinTokenOnLogin(user, password);
  const refreshedUser = await getActiveUser(user.id);

  const token = issueToken(user);

  res.json({ token, user: toPublicUser(refreshedUser ?? user) });
});

authRouter.get("/me", jwtAuth, (req, res) => {
  res.json(res.locals.user);
});
