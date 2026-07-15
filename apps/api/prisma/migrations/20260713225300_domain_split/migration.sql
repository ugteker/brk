-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Playbook" (
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
    "executionMode" TEXT NOT NULL DEFAULT 'latest_only',
    "maxSourcesPerRun" INTEGER NOT NULL DEFAULT 3,
    "maxItemsPerSource" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playbook_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaybookSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playbookId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaybookSource_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlaybookSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grantedByUserId" TEXT NOT NULL,
    "granteeUserId" TEXT,
    "granteeAgentId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "agentId" TEXT,
    "sourceId" TEXT,
    "playbookId" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccessGrant_granteeAgentId_fkey" FOREIGN KEY ("granteeAgentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessGrant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessGrant_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccessGrant_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketplacePublication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publisherUserId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "retiredAt" DATETIME,
    "agentId" TEXT,
    "sourceId" TEXT,
    "playbookId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplacePublication_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MarketplacePublication_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MarketplacePublication_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_ownerUserId_type_value_key" ON "Source"("ownerUserId", "type", "value");

-- CreateIndex
CREATE INDEX "Playbook_agentId_enabled_idx" ON "Playbook"("agentId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookSource_playbookId_sourceId_key" ON "PlaybookSource"("playbookId", "sourceId");

-- CreateIndex
CREATE INDEX "PlaybookSource_sourceId_enabled_idx" ON "PlaybookSource"("sourceId", "enabled");

-- CreateIndex
CREATE INDEX "AccessGrant_resourceType_resourceId_idx" ON "AccessGrant"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AccessGrant_granteeUserId_resourceType_resourceId_idx" ON "AccessGrant"("granteeUserId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AccessGrant_granteeAgentId_resourceType_resourceId_idx" ON "AccessGrant"("granteeAgentId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "MarketplacePublication_resourceType_resourceId_idx" ON "MarketplacePublication"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "MarketplacePublication_publisherUserId_status_visibility_idx" ON "MarketplacePublication"("publisherUserId", "status", "visibility");
