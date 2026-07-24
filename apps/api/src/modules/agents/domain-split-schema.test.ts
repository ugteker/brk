import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');
const migrationPath = path.resolve(
  __dirname,
  '../../../prisma/migrations/20260724090000_add_shared_catalog_foundation/migration.sql'
);

async function readSchema(): Promise<string> {
  return readFile(schemaPath, 'utf8');
}

describe('domain split schema foundation', () => {
  it('adds split domain models alongside legacy models', async () => {
    const schema = await readSchema();

    expect(schema).toContain('model Source {');
    expect(schema).toContain('model Playbook {');
    expect(schema).toContain('model PlaybookSource {');
    expect(schema).toContain('model AccessGrant {');
    expect(schema).toContain('model MarketplacePublication {');
  });

  it('defines playbook composition and scheduling fields', async () => {
    const schema = await readSchema();

    expect(schema).toContain('agentId');
    expect(schema).toContain('mode');
    expect(schema).toContain('intervalMinutes');
    expect(schema).toContain('dailyTime');
    expect(schema).toContain('timezone');
    expect(schema).toContain('daysOfWeekJson');
  });

  it('uses resource-scoped access and publication fields', async () => {
    const schema = await readSchema();

    expect(schema).toContain('resourceType');
    expect(schema).toContain('resourceId');
    expect(schema).toContain('visibility');
    expect(schema).toContain('publishedAt');
  });

  it('defines shared library memberships and immutable execution versions', async () => {
    const schema = await readSchema();

    expect(schema).toContain('model UserLibrarySource');
    expect(schema).toContain('@@unique([userId, sourceId])');
    expect(schema).toContain('model UserLibraryAgent');
    expect(schema).toContain('@@unique([userId, agentVersionId])');
    expect(schema).toContain('basedOnAgentVersionId String?');
    expect(schema).toContain('iconAssetKey');
    expect(schema).toContain('agentVersionId String?');
    expect(schema).toMatch(/nextRunAt\s+DateTime\?/);
  });

  it('backfills immutable snapshots and version pins without unrelated schema changes', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain('JOIN "Agent"');
    expect(migration).toContain('COALESCE(');
    expect(migration).toContain('"AgentRunReport"');
    expect(migration).not.toContain('"RealtimeEvent"');
  });
});
