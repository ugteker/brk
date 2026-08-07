ALTER TABLE "DiscussionRun" ADD COLUMN "questionsClosedAt" DATETIME;

CREATE TABLE "DiscussionLiveQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discussionRunId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredByTurnId" TEXT,
    "answeredAt" DATETIME,
    CONSTRAINT "DiscussionLiveQuestion_discussionRunId_fkey"
      FOREIGN KEY ("discussionRunId") REFERENCES "DiscussionRun" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiscussionLiveQuestion_answeredByTurnId_fkey"
      FOREIGN KEY ("answeredByTurnId") REFERENCES "DiscussionTurn" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "DiscussionLiveQuestion_discussionRunId_answeredAt_createdAt_id_idx"
ON "DiscussionLiveQuestion"("discussionRunId", "answeredAt", "createdAt", "id");
