ALTER TABLE "AppUser" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'approved';

CREATE INDEX "AppUser_approvalStatus_idx" ON "AppUser"("approvalStatus");
