CREATE TABLE "MediaReleaseDetailCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "lastError" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MediaReleaseDetailCache_url_key" ON "MediaReleaseDetailCache"("url");
CREATE INDEX "MediaReleaseDetailCache_provider_expiresAt_idx" ON "MediaReleaseDetailCache"("provider", "expiresAt");
