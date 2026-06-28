-- CreateTable
CREATE TABLE "MediaPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "tvdbId" INTEGER,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "poster" TEXT,
    "backdrop" TEXT,
    "year" INTEGER,
    "overview" TEXT,
    "rating" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MediaPreference_status_updatedAt_idx" ON "MediaPreference"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaPreference_kind_tmdbId_key" ON "MediaPreference"("kind", "tmdbId");
