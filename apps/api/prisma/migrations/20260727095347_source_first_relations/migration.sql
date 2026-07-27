/*
  Warnings:

  - You are about to drop the `PlaybookSource` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `executionMode` on the `Playbook` table. All the data in the column will be lost.
  - You are about to drop the column `maxSourcesPerRun` on the `Playbook` table. All the data in the column will be lost.
  - Added the required column `sourceId` to the `Playbook` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AgentCurationSession_baseAgentVersionId_idx";

-- DropIndex
DROP INDEX "CatalogDemo_status_locale_idx";

-- DropIndex
DROP INDEX "MarketplacePublication_agentVersionId_idx";

-- DropIndex
DROP INDEX "PlaybookSource_sourceId_enabled_idx";

-- DropIndex
DROP INDEX "PlaybookSource_playbookId_sourceId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlaybookSource";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "entityId" TEXT,
    "agentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "sourceId" TEXT,
    "playbookId" TEXT,
    "agentVersionId" TEXT,
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "phase" TEXT,
    "workerId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentRun" ("agentId", "agentVersionId", "createdAt", "errorCode", "errorMessage", "finishedAt", "id", "phase", "playbookId", "retryCount", "scheduledFor", "startedAt", "status", "updatedAt", "workerId") SELECT "agentId", "agentVersionId", "createdAt", "errorCode", "errorMessage", "finishedAt", "id", "phase", "playbookId", "retryCount", "scheduledFor", "startedAt", "status", "updatedAt", "workerId" FROM "AgentRun";
DROP TABLE "AgentRun";
ALTER TABLE "new_AgentRun" RENAME TO "AgentRun";
CREATE UNIQUE INDEX "AgentRun_agentId_scheduledFor_key" ON "AgentRun"("agentId", "scheduledFor");
CREATE TABLE "new_AgentRunReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "sourceId" TEXT,
    "agentRunId" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reportJson" TEXT,
    "sourceWarningsJson" TEXT NOT NULL,
    "needsHumanReview" BOOLEAN NOT NULL,
    "model" TEXT,
    "promptVersionNumber" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" REAL,
    "readAt" DATETIME,
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRunReport_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRunReport_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRunReport_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRunReport_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentRunReport" ("agentId", "agentRunId", "createdAt", "dismissedAt", "estimatedCostUsd", "id", "inputTokens", "model", "needsHumanReview", "outputTokens", "promptVersionId", "promptVersionNumber", "readAt", "reportJson", "sourceWarningsJson", "summary", "updatedAt") SELECT "agentId", "agentRunId", "createdAt", "dismissedAt", "estimatedCostUsd", "id", "inputTokens", "model", "needsHumanReview", "outputTokens", "promptVersionId", "promptVersionNumber", "readAt", "reportJson", "sourceWarningsJson", "summary", "updatedAt" FROM "AgentRunReport";
DROP TABLE "AgentRunReport";
ALTER TABLE "new_AgentRunReport" RENAME TO "AgentRunReport";
CREATE UNIQUE INDEX "AgentRunReport_agentRunId_key" ON "AgentRunReport"("agentRunId");
CREATE TABLE "new_Playbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "agentVersionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'interval',
    "intervalMinutes" INTEGER,
    "dailyTime" TEXT,
    "timezone" TEXT,
    "daysOfWeekJson" TEXT,
    "nextRunAt" DATETIME,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestFrequency" TEXT NOT NULL DEFAULT 'immediate',
    "lastDigestSentAt" DATETIME,
    "maxItemsPerSource" INTEGER NOT NULL DEFAULT 1,
    "recipientsJson" TEXT NOT NULL DEFAULT '[]',
    "followTargetType" TEXT,
    "followTargetKey" TEXT,
    "followTargetTitle" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playbook_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Playbook_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Playbook_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Playbook" ("agentId", "agentVersionId", "createdAt", "dailyTime", "daysOfWeekJson", "description", "digestFrequency", "enabled", "followTargetKey", "followTargetTitle", "followTargetType", "id", "intervalMinutes", "language", "lastDigestSentAt", "maxItemsPerSource", "mode", "name", "nextRunAt", "notificationsEnabled", "recipientsJson", "timezone", "updatedAt") SELECT "agentId", "agentVersionId", "createdAt", "dailyTime", "daysOfWeekJson", "description", "digestFrequency", "enabled", "followTargetKey", "followTargetTitle", "followTargetType", "id", "intervalMinutes", "language", "lastDigestSentAt", "maxItemsPerSource", "mode", "name", "nextRunAt", "notificationsEnabled", "recipientsJson", "timezone", "updatedAt" FROM "Playbook";
DROP TABLE "Playbook";
ALTER TABLE "new_Playbook" RENAME TO "Playbook";
CREATE INDEX "Playbook_agentId_enabled_idx" ON "Playbook"("agentId", "enabled");
CREATE UNIQUE INDEX "Playbook_agentId_sourceId_key" ON "Playbook"("agentId", "sourceId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationExpiresAt" DATETIME,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetToken" TEXT,
    "passwordResetExpiresAt" DATETIME,
    "monthlyBudgetUsd" REAL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "displayName", "email", "emailVerificationExpiresAt", "emailVerificationToken", "emailVerified", "googleId", "id", "locked", "monthlyBudgetUsd", "passwordHash", "passwordResetExpiresAt", "passwordResetToken", "role", "updatedAt") SELECT "createdAt", "displayName", "email", "emailVerificationExpiresAt", "emailVerificationToken", "emailVerified", "googleId", "id", "locked", "monthlyBudgetUsd", "passwordHash", "passwordResetExpiresAt", "passwordResetToken", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RealtimeEvent_userId_id_idx" ON "RealtimeEvent"("userId", "id");

-- CreateIndex
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");
