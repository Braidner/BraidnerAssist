ALTER TABLE "MediaReleaseDecision" ADD COLUMN "seasonNumber" INTEGER;
ALTER TABLE "MediaReleaseDecision" ADD COLUMN "selectedInfohash" TEXT;
ALTER TABLE "MediaReleaseDecision" ADD COLUMN "selectedAt" DATETIME;

CREATE INDEX "MediaReleaseDecision_selectedInfohash_idx" ON "MediaReleaseDecision"("selectedInfohash");
