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
  const hasRecipientsJsonColumn = playbookColumns.some((column) => column.name === 'recipientsJson');
  if (hasRecipientsJsonColumn) {
    return;
  }

  await prisma.$executeRawUnsafe("ALTER TABLE \"Playbook\" ADD COLUMN \"recipientsJson\" TEXT NOT NULL DEFAULT '[]'");
}
