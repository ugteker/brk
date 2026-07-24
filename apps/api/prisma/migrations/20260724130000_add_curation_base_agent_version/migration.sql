ALTER TABLE "AgentCurationSession"
ADD COLUMN "baseAgentVersionId" TEXT REFERENCES "AgentPromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AgentCurationSession_baseAgentVersionId_idx"
ON "AgentCurationSession"("baseAgentVersionId");
