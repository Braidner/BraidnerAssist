ALTER TABLE "MediaPreference" ADD COLUMN "appUserId" TEXT NOT NULL DEFAULT 'global';

DROP INDEX "MediaPreference_kind_tmdbId_key";

CREATE UNIQUE INDEX "MediaPreference_appUserId_kind_tmdbId_key"
  ON "MediaPreference"("appUserId", "kind", "tmdbId");

CREATE INDEX "MediaPreference_appUserId_status_updatedAt_idx"
  ON "MediaPreference"("appUserId", "status", "updatedAt");
