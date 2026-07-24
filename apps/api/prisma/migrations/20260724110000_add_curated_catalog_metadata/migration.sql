ALTER TABLE "MarketplacePublication" ADD COLUMN "slug" TEXT;
ALTER TABLE "MarketplacePublication" ADD COLUMN "catalogVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MarketplacePublication" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'community';
ALTER TABLE "MarketplacePublication" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "MarketplacePublication" ADD COLUMN "sourceTypesJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "MarketplacePublication" ADD COLUMN "topicsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "MarketplacePublication" ADD COLUMN "iconAssetKey" TEXT;
ALTER TABLE "MarketplacePublication" ADD COLUMN "editorialRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketplacePublication" ADD COLUMN "agentVersionId" TEXT REFERENCES "AgentPromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "MarketplacePublication"
SET "agentVersionId" = (
    SELECT prompt."id"
    FROM "AgentPromptVersion" AS prompt
    WHERE prompt."agentId" = "MarketplacePublication"."agentId"
    ORDER BY prompt."version" DESC
    LIMIT 1
)
WHERE "resourceType" = 'agent'
  AND "agentId" IS NOT NULL
  AND "agentVersionId" IS NULL;

CREATE TABLE "CatalogDemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourcePublicationId" TEXT NOT NULL,
    "agentPublicationId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL,
    "disclosure" TEXT NOT NULL,
    "reportJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogDemo_sourcePublicationId_fkey" FOREIGN KEY ("sourcePublicationId") REFERENCES "MarketplacePublication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CatalogDemo_agentPublicationId_fkey" FOREIGN KEY ("agentPublicationId") REFERENCES "MarketplacePublication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MarketplacePublication_agentVersionId_idx" ON "MarketplacePublication"("agentVersionId");
CREATE UNIQUE INDEX "MarketplacePublication_origin_resourceType_slug_catalogVersion_locale_key"
  ON "MarketplacePublication"("origin", "resourceType", "slug", "catalogVersion", "locale");
CREATE UNIQUE INDEX "CatalogDemo_slug_locale_key" ON "CatalogDemo"("slug", "locale");
CREATE INDEX "CatalogDemo_status_locale_idx" ON "CatalogDemo"("status", "locale");
