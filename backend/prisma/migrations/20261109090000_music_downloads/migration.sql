CREATE TABLE "MusicDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "infohash" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "scannedAt" DATETIME
);
CREATE UNIQUE INDEX "MusicDownload_infohash_key" ON "MusicDownload"("infohash");
CREATE INDEX "MusicDownload_appUserId_createdAt_idx" ON "MusicDownload"("appUserId", "createdAt");
CREATE INDEX "MusicDownload_scannedAt_idx" ON "MusicDownload"("scannedAt");
