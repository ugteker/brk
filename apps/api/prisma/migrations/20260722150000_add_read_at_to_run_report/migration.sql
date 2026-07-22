-- Adds per-report read state for the feed unread indicator
ALTER TABLE "AgentRunReport" ADD COLUMN "readAt" DATETIME;
