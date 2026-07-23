-- CreateTable
CREATE TABLE "AgentCurationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "targetAgentId" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "finalizationAgentId" TEXT,
    "sourceContextJson" TEXT NOT NULL DEFAULT '{}',
    "draftJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentCurationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentCurationMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentCurationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AgentCurationSession_ownerUserId_status_idx" ON "AgentCurationSession"("ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCurationMessage_sessionId_position_key" ON "AgentCurationMessage"("sessionId", "position");
