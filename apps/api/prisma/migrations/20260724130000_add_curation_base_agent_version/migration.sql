ALTER TABLE "AgentCurationSession"
ADD COLUMN "baseAgentVersionId" TEXT;

ALTER TABLE "AgentCurationSession"
ADD CONSTRAINT "AgentCurationSession_baseAgentVersionId_fkey"
FOREIGN KEY ("baseAgentVersionId") REFERENCES "AgentPromptVersion"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "AgentCurationSession_baseAgentVersionId_idx"
ON "AgentCurationSession"("baseAgentVersionId");
