ALTER TABLE "AgentPromptVersion" ADD COLUMN "curationSessionId" TEXT;

ALTER TABLE "AgentCurationMessage" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "AgentCurationMessage" ADD COLUMN "replyJson" TEXT;
ALTER TABLE "AgentCurationMessage" ADD COLUMN "replyClaimedAt" DATETIME;

CREATE UNIQUE INDEX "AgentPromptVersion_curationSessionId_key" ON "AgentPromptVersion"("curationSessionId");

CREATE UNIQUE INDEX "AgentCurationMessage_sessionId_clientRequestId_key" ON "AgentCurationMessage"("sessionId", "clientRequestId");
