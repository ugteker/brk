-- CreateTable
CREATE TABLE "UserLibrarySource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "displayNameOverride" TEXT,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserLibrarySource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserLibraryAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentVersionId" TEXT NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserLibraryAgent_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentPromptVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "characterType" TEXT NOT NULL DEFAULT 'summarizer',
    "promptConfigJson" TEXT NOT NULL DEFAULT '{}',
    "iconAssetKey" TEXT,
    "basedOnAgentVersionId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "curationSessionId" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentPromptVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentPromptVersion_basedOnAgentVersionId_fkey" FOREIGN KEY ("basedOnAgentVersionId") REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentPromptVersion" (
    "agentId",
    "createdAt",
    "curationSessionId",
    "description",
    "enabled",
    "id",
    "model",
    "name",
    "characterType",
    "promptConfigJson",
    "systemPrompt",
    "updatedAt",
    "version"
)
SELECT
    prompt."agentId",
    prompt."createdAt",
    prompt."curationSessionId",
    agent."description",
    prompt."enabled",
    prompt."id",
    prompt."model",
    agent."name",
    agent."characterType",
    agent."promptConfigJson",
    prompt."systemPrompt",
    prompt."updatedAt",
    prompt."version"
FROM "AgentPromptVersion" AS prompt
JOIN "Agent" AS agent ON agent."id" = prompt."agentId";
DROP TABLE "AgentPromptVersion";
ALTER TABLE "new_AgentPromptVersion" RENAME TO "AgentPromptVersion";
CREATE UNIQUE INDEX "AgentPromptVersion_curationSessionId_key" ON "AgentPromptVersion"("curationSessionId");
CREATE UNIQUE INDEX "AgentPromptVersion_agentId_version_key" ON "AgentPromptVersion"("agentId", "version");
CREATE TABLE "new_AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
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
    CONSTRAINT "AgentRun_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentRun_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentRun" (
    "agentId",
    "agentVersionId",
    "createdAt",
    "errorCode",
    "errorMessage",
    "finishedAt",
    "id",
    "phase",
    "playbookId",
    "retryCount",
    "scheduledFor",
    "startedAt",
    "status",
    "updatedAt",
    "workerId"
)
SELECT
    run."agentId",
    COALESCE(
        (SELECT report."promptVersionId" FROM "AgentRunReport" AS report WHERE report."agentRunId" = run."id"),
        (SELECT prompt."id" FROM "AgentPromptVersion" AS prompt WHERE prompt."agentId" = run."agentId" ORDER BY prompt."version" DESC LIMIT 1)
    ),
    run."createdAt",
    run."errorCode",
    run."errorMessage",
    run."finishedAt",
    run."id",
    run."phase",
    run."playbookId",
    run."retryCount",
    run."scheduledFor",
    run."startedAt",
    run."status",
    run."updatedAt",
    run."workerId"
FROM "AgentRun" AS run;
DROP TABLE "AgentRun";
ALTER TABLE "new_AgentRun" RENAME TO "AgentRun";
CREATE UNIQUE INDEX "AgentRun_agentId_scheduledFor_key" ON "AgentRun"("agentId", "scheduledFor");
CREATE TABLE "new_Playbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
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
    CONSTRAINT "Playbook_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Playbook_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Playbook" (
    "agentId",
    "agentVersionId",
    "createdAt",
    "dailyTime",
    "daysOfWeekJson",
    "description",
    "digestFrequency",
    "enabled",
    "executionMode",
    "followTargetKey",
    "followTargetTitle",
    "followTargetType",
    "id",
    "intervalMinutes",
    "language",
    "lastDigestSentAt",
    "maxItemsPerSource",
    "maxSourcesPerRun",
    "mode",
    "name",
    "nextRunAt",
    "notificationsEnabled",
    "recipientsJson",
    "timezone",
    "updatedAt"
)
SELECT
    playbook."agentId",
    (SELECT prompt."id" FROM "AgentPromptVersion" AS prompt WHERE prompt."agentId" = playbook."agentId" ORDER BY prompt."version" DESC LIMIT 1),
    playbook."createdAt",
    playbook."dailyTime",
    playbook."daysOfWeekJson",
    playbook."description",
    playbook."digestFrequency",
    playbook."enabled",
    playbook."executionMode",
    playbook."followTargetKey",
    playbook."followTargetTitle",
    playbook."followTargetType",
    playbook."id",
    playbook."intervalMinutes",
    playbook."language",
    playbook."lastDigestSentAt",
    playbook."maxItemsPerSource",
    playbook."maxSourcesPerRun",
    playbook."mode",
    playbook."name",
    playbook."nextRunAt",
    playbook."notificationsEnabled",
    playbook."recipientsJson",
    playbook."timezone",
    playbook."updatedAt"
FROM "Playbook" AS playbook;
DROP TABLE "Playbook";
ALTER TABLE "new_Playbook" RENAME TO "Playbook";
CREATE INDEX "Playbook_agentId_enabled_idx" ON "Playbook"("agentId", "enabled");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserLibrarySource_userId_savedAt_idx" ON "UserLibrarySource"("userId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserLibrarySource_userId_sourceId_key" ON "UserLibrarySource"("userId", "sourceId");

-- CreateIndex
CREATE INDEX "UserLibraryAgent_userId_savedAt_idx" ON "UserLibraryAgent"("userId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserLibraryAgent_userId_agentVersionId_key" ON "UserLibraryAgent"("userId", "agentVersionId");
