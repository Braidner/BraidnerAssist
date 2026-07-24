import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("self-registration stays pending until an admin approves a role", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "mission-control-auth-"));
  const databasePath = path.join(tempDir, "test.db");
  const databaseUrl = `file:${databasePath}`;

  process.env.DATABASE_URL = databaseUrl;
  execFileSync("/usr/bin/sqlite3", [databasePath], {
    input: `
      CREATE TABLE "AppUser" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "displayName" TEXT,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'media',
        "approvalStatus" TEXT NOT NULL DEFAULT 'approved',
        "jellyfinUserId" TEXT,
        "jellyfinAccessToken" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
    `,
  });

  const users = await import("../src/auth/users.js");
  const { prisma } = await import("../src/db/client.js");

  try {
    const admin = await users.createFirstAdmin({
      username: "owner",
      password: "owner-secret",
    });
    assert.equal(admin.approvalStatus, "approved");
    assert.equal(admin.role, "admin");

    const pending = await users.createPendingUser({
      username: "viewer",
      password: "viewer-secret",
      displayName: "Viewer",
    });
    assert.equal(pending.approvalStatus, "pending");
    assert.equal(pending.role, "media");
    assert.equal(await users.getActiveUser(pending.id), null);

    const credentials = await users.verifyUserCredentials("viewer", "viewer-secret");
    assert.equal(credentials?.approvalStatus, "pending");

    const approved = await users.approveUser(pending.id, "admin");
    assert.equal(approved.approvalStatus, "approved");
    assert.equal(approved.role, "admin");
    assert.equal((await users.getActiveUser(pending.id))?.id, pending.id);
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
