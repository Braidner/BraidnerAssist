CREATE TABLE "MusicLike" (
    "appUserId" TEXT NOT NULL REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "trackId" TEXT NOT NULL,
    PRIMARY KEY ("appUserId", "trackId")
);
CREATE TABLE "MusicPlaylist" (
    "appUserId" TEXT NOT NULL REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "name" TEXT NOT NULL,
    "tracks" TEXT NOT NULL,
    PRIMARY KEY ("appUserId", "name")
);
