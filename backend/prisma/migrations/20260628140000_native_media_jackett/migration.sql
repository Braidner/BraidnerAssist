-- Native media pipeline: local monitor/import state and quality profiles.

ALTER TABLE "MediaTorrent" ADD COLUMN "category" TEXT DEFAULT 'mc-native';
ALTER TABLE "MediaTorrent" ADD COLUMN "importStatus" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "MediaTorrent" ADD COLUMN "importedAt" DATETIME;
ALTER TABLE "MediaTorrent" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "MediaTorrent" ADD COLUMN "progress" REAL NOT NULL DEFAULT 0;
ALTER TABLE "MediaTorrent" ADD COLUMN "lastError" TEXT;

ALTER TABLE "MediaTorrentFile" ADD COLUMN "importedPath" TEXT;
ALTER TABLE "MediaTorrentFile" ADD COLUMN "importedAt" DATETIME;
ALTER TABLE "MediaTorrentFile" ADD COLUMN "importError" TEXT;

CREATE TABLE "MediaQualityProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'both',
  "minResolution" INTEGER NOT NULL DEFAULT 720,
  "maxResolution" INTEGER NOT NULL DEFAULT 1080,
  "preferHdr" BOOLEAN NOT NULL DEFAULT false,
  "allowHdr" BOOLEAN NOT NULL DEFAULT true,
  "allowHevc" BOOLEAN NOT NULL DEFAULT true,
  "allowAv1" BOOLEAN NOT NULL DEFAULT true,
  "preferredLanguages" TEXT NOT NULL DEFAULT 'ru,en',
  "bannedWords" TEXT NOT NULL DEFAULT '',
  "maxMovieSizeGb" REAL,
  "maxEpisodeSizeGb" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "MediaQualityProfile_name_key" ON "MediaQualityProfile"("name");

CREATE TABLE "MediaMonitor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "tvdbId" INTEGER,
  "title" TEXT NOT NULL,
  "year" INTEGER,
  "poster" TEXT,
  "backdrop" TEXT,
  "overview" TEXT,
  "monitored" BOOLEAN NOT NULL DEFAULT true,
  "searchMode" TEXT NOT NULL DEFAULT 'manual',
  "qualityProfileId" TEXT,
  "lastSearchAt" DATETIME,
  "lastGrabAt" DATETIME,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MediaMonitor_qualityProfileId_fkey" FOREIGN KEY ("qualityProfileId") REFERENCES "MediaQualityProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MediaMonitor_kind_tmdbId_key" ON "MediaMonitor"("kind", "tmdbId");
CREATE INDEX "MediaMonitor_monitored_updatedAt_idx" ON "MediaMonitor"("monitored", "updatedAt");

CREATE TABLE "MediaMonitorSeason" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monitorId" TEXT NOT NULL,
  "seasonNumber" INTEGER NOT NULL,
  "monitored" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MediaMonitorSeason_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "MediaMonitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MediaMonitorSeason_monitorId_seasonNumber_key" ON "MediaMonitorSeason"("monitorId", "seasonNumber");

CREATE TABLE "MediaMonitorEpisode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monitorId" TEXT NOT NULL,
  "seasonNumber" INTEGER NOT NULL,
  "episodeNumber" INTEGER NOT NULL,
  "title" TEXT,
  "airDate" DATETIME,
  "monitored" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'wanted',
  "importedPath" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MediaMonitorEpisode_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "MediaMonitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MediaMonitorEpisode_monitorId_seasonNumber_episodeNumber_key" ON "MediaMonitorEpisode"("monitorId", "seasonNumber", "episodeNumber");
CREATE INDEX "MediaMonitorEpisode_status_airDate_idx" ON "MediaMonitorEpisode"("status", "airDate");

CREATE TABLE "MediaReleaseDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monitorId" TEXT,
  "kind" TEXT NOT NULL,
  "tmdbId" INTEGER,
  "tvdbId" INTEGER,
  "query" TEXT NOT NULL,
  "guid" TEXT,
  "title" TEXT NOT NULL,
  "indexer" TEXT,
  "score" INTEGER NOT NULL DEFAULT 0,
  "reasons" TEXT NOT NULL DEFAULT '[]',
  "warnings" TEXT NOT NULL DEFAULT '[]',
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaReleaseDecision_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "MediaMonitor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "MediaReleaseDecision_kind_tmdbId_createdAt_idx" ON "MediaReleaseDecision"("kind", "tmdbId", "createdAt");

CREATE TABLE "MediaImportEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monitorId" TEXT,
  "torrentId" TEXT,
  "infohash" TEXT,
  "level" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "payload" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaImportEvent_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "MediaMonitor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "MediaImportEvent_level_createdAt_idx" ON "MediaImportEvent"("level", "createdAt");
