-- AlterTable
ALTER TABLE "DiscussionParticipant" ADD COLUMN "reportIdsJson" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "DiscussionRun" ADD COLUMN "evidenceSnapshotJson" TEXT;
