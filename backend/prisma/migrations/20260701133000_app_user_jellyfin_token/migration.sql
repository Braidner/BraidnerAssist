-- Server-side Jellyfin user token used for playback session reporting.
ALTER TABLE "AppUser" ADD COLUMN "jellyfinAccessToken" TEXT;
