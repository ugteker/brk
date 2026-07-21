import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

interface SqliteTableNameRow {
  name: string;
}

interface SqliteTableInfoRow {
  name: string;
}

export async function ensureSqliteSchemaCompatibility(): Promise<void> {
  const playbookTableRows = await prisma.$queryRawUnsafe<SqliteTableNameRow[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Playbook'"
  );
  if (playbookTableRows.length === 0) {
    return;
  }

  const playbookColumns = await prisma.$queryRawUnsafe<SqliteTableInfoRow[]>("PRAGMA table_info('Playbook')");
  const columnNames = new Set(playbookColumns.map((col) => col.name));

  if (!columnNames.has('recipientsJson')) {
    await prisma.$executeRawUnsafe("ALTER TABLE \"Playbook\" ADD COLUMN \"recipientsJson\" TEXT NOT NULL DEFAULT '[]'");
  }
  if (!columnNames.has('followTargetType')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Playbook" ADD COLUMN "followTargetType" TEXT');
  }
  if (!columnNames.has('followTargetKey')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Playbook" ADD COLUMN "followTargetKey" TEXT');
  }
  if (!columnNames.has('followTargetTitle')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Playbook" ADD COLUMN "followTargetTitle" TEXT');
  }
  if (!columnNames.has('language')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Playbook" ADD COLUMN "language" TEXT NOT NULL DEFAULT \'en\'');
  }
  if (!columnNames.has('digestFrequency')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Playbook" ADD COLUMN "digestFrequency" TEXT NOT NULL DEFAULT \'immediate\'');
  }
  if (!columnNames.has('lastDigestSentAt')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Playbook" ADD COLUMN "lastDigestSentAt" DATETIME');
  }

  const agentRunColumns = await prisma.$queryRawUnsafe<SqliteTableInfoRow[]>("PRAGMA table_info('AgentRun')");
  const agentRunColumnNames = new Set(agentRunColumns.map((col) => col.name));
  if (!agentRunColumnNames.has('playbookId')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "AgentRun" ADD COLUMN "playbookId" TEXT REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE');
  }

  const userColumns = await prisma.$queryRawUnsafe<SqliteTableInfoRow[]>("PRAGMA table_info('User')");
  const userColumnNames = new Set(userColumns.map((col) => col.name));
  if (!userColumnNames.has('monthlyBudgetUsd')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "monthlyBudgetUsd" REAL');
  }

  const discussionParticipantTableRows = await prisma.$queryRawUnsafe<SqliteTableNameRow[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'DiscussionParticipant'"
  );
  if (discussionParticipantTableRows.length > 0) {
    const participantColumns = await prisma.$queryRawUnsafe<SqliteTableInfoRow[]>(
      "PRAGMA table_info('DiscussionParticipant')"
    );
    const participantColumnNames = new Set(participantColumns.map((col) => col.name));
    if (!participantColumnNames.has('reportIdsJson')) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "DiscussionParticipant" ADD COLUMN "reportIdsJson" TEXT NOT NULL DEFAULT \'[]\''
      );
    }
  }

  const discussionRunTableRows = await prisma.$queryRawUnsafe<SqliteTableNameRow[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'DiscussionRun'"
  );
  if (discussionRunTableRows.length > 0) {
    const runColumns = await prisma.$queryRawUnsafe<SqliteTableInfoRow[]>("PRAGMA table_info('DiscussionRun')");
    const runColumnNames = new Set(runColumns.map((col) => col.name));
    if (!runColumnNames.has('evidenceSnapshotJson')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "DiscussionRun" ADD COLUMN "evidenceSnapshotJson" TEXT');
    }
  }
}
