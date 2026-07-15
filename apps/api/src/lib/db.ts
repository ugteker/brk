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
}
