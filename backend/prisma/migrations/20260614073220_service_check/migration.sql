-- CreateTable
CREATE TABLE "ServiceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ServiceCheck_name_createdAt_idx" ON "ServiceCheck"("name", "createdAt");
