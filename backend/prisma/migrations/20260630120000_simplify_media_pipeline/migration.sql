PRAGMA foreign_keys=OFF;

CREATE TABLE "MediaTitle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "tvdbId" INTEGER,
  "title" TEXT NOT NULL,
  "year" INTEGER,
  "poster" TEXT,
  "backdrop" TEXT,
  "overview" TEXT,
  "jellyfinId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "MediaTitle" (
  "id", "kind", "tmdbId", "tvdbId", "title", "createdAt", "updatedAt"
)
SELECT
  'legacy-' || lower("infohash"),
  CASE WHEN "contentType" = 'series' THEN 'series' ELSE 'movie' END,
  COALESCE("tmdbId", abs(random()) + 1000000000),
  "tvdbId",
  COALESCE(NULLIF("title", ''), 'Legacy torrent'),
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "MediaTorrent";

CREATE TABLE "new_MediaTorrent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "titleId" TEXT NOT NULL,
  "infohash" TEXT NOT NULL,
  "releaseTitle" TEXT NOT NULL,
  "releaseUrl" TEXT,
  "guid" TEXT,
  "indexer" TEXT,
  "size" REAL,
  "seeders" INTEGER,
  "savePath" TEXT,
  "category" TEXT DEFAULT 'mc-library',
  "seasonNumber" INTEGER,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "lastSeenAt" DATETIME,
  "state" TEXT,
  "progress" REAL NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaTorrent_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "MediaTitle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_MediaTorrent" (
  "id", "titleId", "infohash", "releaseTitle", "releaseUrl", "savePath", "category",
  "completedAt", "progress", "createdAt", "updatedAt"
)
SELECT
  "id",
  CASE
    WHEN "tmdbId" IS NULL THEN 'legacy-' || lower("infohash")
    ELSE (
      SELECT "MediaTitle"."id"
      FROM "MediaTitle"
      WHERE "MediaTitle"."kind" = CASE WHEN "MediaTorrent"."contentType" = 'series' THEN 'series' ELSE 'movie' END
        AND "MediaTitle"."tmdbId" = "MediaTorrent"."tmdbId"
      LIMIT 1
    )
  END,
  lower("infohash"),
  COALESCE(NULLIF("title", ''), lower("infohash")),
  "magnet",
  "savePath",
  COALESCE("category", 'mc-library'),
  "completedAt",
  COALESCE("progress", 0),
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "MediaTorrent";

DROP TABLE "MediaTorrent";
ALTER TABLE "new_MediaTorrent" RENAME TO "MediaTorrent";

DROP TABLE IF EXISTS "MediaTorrentFile";
DROP TABLE IF EXISTS "MediaMonitorEpisode";
DROP TABLE IF EXISTS "MediaMonitorSeason";
DROP TABLE IF EXISTS "MediaReleaseDecision";
DROP TABLE IF EXISTS "MediaImportEvent";
DROP TABLE IF EXISTS "MediaMonitor";
DROP TABLE IF EXISTS "MediaQualityProfile";

CREATE UNIQUE INDEX "MediaTitle_kind_tmdbId_key" ON "MediaTitle"("kind", "tmdbId");
CREATE INDEX "MediaTitle_jellyfinId_idx" ON "MediaTitle"("jellyfinId");
CREATE UNIQUE INDEX "MediaTorrent_infohash_key" ON "MediaTorrent"("infohash");
CREATE INDEX "MediaTorrent_titleId_updatedAt_idx" ON "MediaTorrent"("titleId", "updatedAt");
CREATE INDEX "MediaTorrent_progress_updatedAt_idx" ON "MediaTorrent"("progress", "updatedAt");

PRAGMA foreign_keys=ON;
