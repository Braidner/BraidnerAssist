-- CreateTable
CREATE TABLE "HermesSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "latestResponseId" TEXT,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
