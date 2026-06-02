-- AlterTable
ALTER TABLE "AgentLog" ADD COLUMN "taskId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "claimedAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "claimedBy" TEXT;
