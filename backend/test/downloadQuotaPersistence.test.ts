import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("quota enforcement and delete-with-files accounting use persisted downloads", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pultra-quota-"));
  const databasePath = path.join(tempDir, "test.db");
  process.env.DATABASE_URL = `file:${databasePath}`;

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
        "downloadLimitTotal" INTEGER,
        "downloadLimitDaily" INTEGER,
        "downloadLimitWeekly" INTEGER,
        "downloadTotalResetAt" DATETIME,
        "downloadDailyResetAt" DATETIME,
        "downloadWeeklyResetAt" DATETIME,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "UserDownload" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "appUserId" TEXT NOT NULL,
        "infohash" TEXT NOT NULL UNIQUE,
        "releaseTitle" TEXT,
        "size" REAL,
        "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("appUserId") REFERENCES "AppUser" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "UserDownload_appUserId_addedAt_idx"
        ON "UserDownload"("appUserId", "addedAt");
      INSERT INTO "AppUser" (
        "id", "username", "passwordHash", "downloadLimitTotal",
        "downloadLimitDaily", "active", "updatedAt"
      ) VALUES (
        'user-1', 'viewer', 'hash', 2, 1, true, CURRENT_TIMESTAMP
      );
    `,
  });

  const quota = await import("../src/integrations/downloadQuota.js");
  const { prisma } = await import("../src/db/client.js");
  const hash = "a".repeat(40);

  try {
    await quota.assertUserCanDownload("user-1", hash);
    await quota.recordUserDownload({ userId: "user-1", infohash: hash });

    const used = await quota.getUserDownloadQuota("user-1");
    assert.equal(used.periods.find((period) => period.key === "daily")?.used, 1);
    await assert.rejects(
      () => quota.assertUserCanDownload("user-1", "b".repeat(40)),
      (error: unknown) =>
        error instanceof quota.DownloadQuotaExceededError &&
        error.period.key === "daily",
    );

    // Повтор того же infohash не расходует второй слот.
    await quota.assertUserCanDownload("user-1", hash);

    // Удаление торрента вместе с файлами освобождает usage-запись.
    await quota.releaseUserDownload(hash);
    const released = await quota.getUserDownloadQuota("user-1");
    assert.equal(released.periods.find((period) => period.key === "daily")?.used, 0);
    await quota.assertUserCanDownload("user-1", "b".repeat(40));
  } finally {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
