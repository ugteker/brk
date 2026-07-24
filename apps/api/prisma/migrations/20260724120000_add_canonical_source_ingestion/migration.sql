CREATE TABLE "SourceIngestionState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "cursorJson" TEXT NOT NULL DEFAULT '{}',
    "lastAttemptAt" DATETIME,
    "refreshedAt" DATETIME,
    "leaseUntil" DATETIME,
    CONSTRAINT "SourceIngestionState_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SourceIngestionState_sourceId_key" ON "SourceIngestionState"("sourceId");

CREATE TABLE "PlaybookSourceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playbookId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaybookSourceItem_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaybookSourceItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlaybookSourceItem_playbookId_sourceItemId_key" ON "PlaybookSourceItem"("playbookId", "sourceItemId");

ALTER TABLE "SourceItem" ADD COLUMN "contentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SourceItem" ADD COLUMN "metadataJson" TEXT NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "SourceItem_sourceId_link_key" ON "SourceItem"("sourceId", "link");
