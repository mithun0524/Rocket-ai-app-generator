-- AlterTable
ALTER TABLE "OpLog" ADD COLUMN "filesTouched" INTEGER;
ALTER TABLE "OpLog" ADD COLUMN "bytesWritten" INTEGER;
ALTER TABLE "OpLog" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "OpLog" ADD COLUMN "installOutput" TEXT;

-- CreateTable
CREATE TABLE "AuditEvent" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "projectId" TEXT,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "data" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "AuditEvent_projectId_createdAt_idx" ON "AuditEvent"("projectId", "createdAt");
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "AuditEvent_type_createdAt_idx" ON "AuditEvent"("type", "createdAt");
