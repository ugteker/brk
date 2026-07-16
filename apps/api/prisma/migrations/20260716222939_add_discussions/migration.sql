/*
  Warnings:

  - You are about to drop the column `recipientsJson` on the `Agent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "monthlyBudgetUsd" REAL;

-- CreateTable
CREATE TABLE "ReportChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WatchlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Discussion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'free_form',
    "formatConfigJson" TEXT NOT NULL DEFAULT '{}',
    "scheduleJson" TEXT,
    "syntheticSourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DiscussionParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discussionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'speaker',
    "voiceId" TEXT NOT NULL DEFAULT 'alloy',
    "speakerOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DiscussionParticipant_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscussionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discussionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "syntheticSourceItemId" TEXT,
    "audioUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscussionRun_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscussionTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discussionRunId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "segmentLabel" TEXT,
    "content" TEXT NOT NULL,
    "audioUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscussionTurn_discussionRunId_fkey" FOREIGN KEY ("discussionRunId") REFERENCES "DiscussionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiscussionTurn_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "DiscussionParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "characterType" TEXT NOT NULL DEFAULT 'summarizer',
    "promptConfigJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "preferencesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Agent" ("characterType", "createdAt", "description", "id", "name", "ownerUserId", "preferencesJson", "promptConfigJson", "status", "updatedAt") SELECT "characterType", "createdAt", "description", "id", "name", "ownerUserId", "preferencesJson", "promptConfigJson", "status", "updatedAt" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE TABLE "new_Playbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'interval',
    "intervalMinutes" INTEGER,
    "dailyTime" TEXT,
    "timezone" TEXT,
    "daysOfWeekJson" TEXT,
    "nextRunAt" DATETIME NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestFrequency" TEXT NOT NULL DEFAULT 'immediate',
    "lastDigestSentAt" DATETIME,
    "executionMode" TEXT NOT NULL DEFAULT 'latest_only',
    "maxSourcesPerRun" INTEGER NOT NULL DEFAULT 3,
    "maxItemsPerSource" INTEGER NOT NULL DEFAULT 1,
    "recipientsJson" TEXT NOT NULL DEFAULT '[]',
    "followTargetType" TEXT,
    "followTargetKey" TEXT,
    "followTargetTitle" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playbook_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Playbook" ("agentId", "createdAt", "dailyTime", "daysOfWeekJson", "description", "enabled", "executionMode", "followTargetKey", "followTargetTitle", "followTargetType", "id", "intervalMinutes", "language", "maxItemsPerSource", "maxSourcesPerRun", "mode", "name", "nextRunAt", "recipientsJson", "timezone", "updatedAt") SELECT "agentId", "createdAt", "dailyTime", "daysOfWeekJson", "description", "enabled", "executionMode", "followTargetKey", "followTargetTitle", "followTargetType", "id", "intervalMinutes", "language", "maxItemsPerSource", "maxSourcesPerRun", "mode", "name", "nextRunAt", "recipientsJson", "timezone", "updatedAt" FROM "Playbook";
DROP TABLE "Playbook";
ALTER TABLE "new_Playbook" RENAME TO "Playbook";
CREATE INDEX "Playbook_agentId_enabled_idx" ON "Playbook"("agentId", "enabled");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ReportChatMessage_reportId_userId_createdAt_idx" ON "ReportChatMessage"("reportId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "WatchlistEntry_symbol_idx" ON "WatchlistEntry"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistEntry_userId_symbol_key" ON "WatchlistEntry"("userId", "symbol");
