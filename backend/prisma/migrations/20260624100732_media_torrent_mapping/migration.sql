-- CreateTable
CREATE TABLE "MediaTorrent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentType" TEXT NOT NULL,
    "tmdbId" INTEGER,
    "tvdbId" INTEGER,
    "title" TEXT NOT NULL,
    "infohash" TEXT NOT NULL,
    "magnet" TEXT,
    "savePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MediaTorrentFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "torrentId" TEXT NOT NULL,
    "fileIndex" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "length" REAL NOT NULL DEFAULT 0,
    "wanted" BOOLEAN NOT NULL DEFAULT false,
    "seasonNumber" INTEGER,
    "episodeNumber" INTEGER,
    CONSTRAINT "MediaTorrentFile_torrentId_fkey" FOREIGN KEY ("torrentId") REFERENCES "MediaTorrent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaTorrent_infohash_key" ON "MediaTorrent"("infohash");

-- CreateIndex
CREATE UNIQUE INDEX "MediaTorrentFile_torrentId_fileIndex_key" ON "MediaTorrentFile"("torrentId", "fileIndex");
