-- Link Mission Control users to Jellyfin users for per-user playback state.
ALTER TABLE "AppUser" ADD COLUMN "jellyfinUserId" TEXT;

CREATE INDEX "AppUser_jellyfinUserId_idx" ON "AppUser"("jellyfinUserId");
