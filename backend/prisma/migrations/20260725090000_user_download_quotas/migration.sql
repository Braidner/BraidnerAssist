ALTER TABLE "AppUser" ADD COLUMN "downloadLimitTotal" INTEGER;
ALTER TABLE "AppUser" ADD COLUMN "downloadLimitDaily" INTEGER;
ALTER TABLE "AppUser" ADD COLUMN "downloadLimitWeekly" INTEGER;
ALTER TABLE "AppUser" ADD COLUMN "downloadTotalResetAt" DATETIME;
ALTER TABLE "AppUser" ADD COLUMN "downloadDailyResetAt" DATETIME;
ALTER TABLE "AppUser" ADD COLUMN "downloadWeeklyResetAt" DATETIME;

CREATE TABLE "UserDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appUserId" TEXT NOT NULL,
    "infohash" TEXT NOT NULL,
    "releaseTitle" TEXT,
    "size" REAL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserDownload_appUserId_fkey"
      FOREIGN KEY ("appUserId") REFERENCES "AppUser" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserDownload_infohash_key" ON "UserDownload"("infohash");
CREATE INDEX "UserDownload_appUserId_addedAt_idx" ON "UserDownload"("appUserId", "addedAt");
