import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG_BUNDLE_PATH,
  PLATFORM_CATALOG_OWNER_USER_ID,
  REPO_ROOT,
  loadCatalogBundle,
  type CatalogBundle,
  validateCatalog
} from './validate';
import { renderCatalogPreviewHtml } from './preview';
import { applyCatalogImport, planCatalogImport, type CatalogImportPlan } from './import';

const API_ROOT = path.join(REPO_ROOT, 'apps', 'api');
const PRISMA_CLI = path.join(API_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const TSX_CLI = path.join(API_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function cloneBundle(bundle: CatalogBundle): CatalogBundle {
  return JSON.parse(JSON.stringify(bundle)) as CatalogBundle;
}

function loadSeedBundle(): CatalogBundle {
  return loadCatalogBundle(DEFAULT_CATALOG_BUNDLE_PATH);
}

async function withCatalogDatabase<T>(
  label: string,
  run: (context: { databaseUrl: string; dbPath: string }) => Promise<T>
): Promise<T> {
  const prismaDirectory = path.join(API_ROOT, 'prisma');
  mkdirSync(prismaDirectory, { recursive: true });

  const databaseFileName = `catalog-tools.${label}.${process.pid}.${Date.now()}.db`;
  const databaseUrl = `file:./${databaseFileName}`;
  const dbPath = path.join(prismaDirectory, databaseFileName);

  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8'
  });

  try {
    return await run({ databaseUrl, dbPath });
  } finally {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }
  }
}

async function withRealCatalogPrisma<T>(
  label: string,
  run: (db: PrismaClient, context: { databaseUrl: string; dbPath: string }) => Promise<T>
): Promise<T> {
  return withCatalogDatabase(label, async (context) => {
    const db = new PrismaClient({ datasourceUrl: context.databaseUrl });
    try {
      return await run(db, context);
    } finally {
      await db.$disconnect();
    }
  });
}

function runCatalogImportCli(databaseUrl: string, ...args: string[]) {
  return spawnSync(process.execPath, [TSX_CLI, 'src/tools/catalog/import.ts', ...args], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8'
  });
}

function createFakeCatalogDb() {
  const state = {
    sources: [] as Array<Record<string, unknown>>,
    agents: [] as Array<Record<string, unknown>>,
    agentPromptVersions: [] as Array<Record<string, unknown>>,
    marketplacePublications: [] as Array<Record<string, unknown>>,
    catalogDemos: [] as Array<Record<string, unknown>>,
    userLibrarySources: [] as Array<{ userId: string; sourceId: string }>,
    userLibraryAgents: [] as Array<{ userId: string; agentVersionId: string }>,
    agentSources: [] as Array<{ agentId: string; type: string; value: string }>
  };

  let sequence = 0;

  function nextId(prefix: string) {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function now() {
    return new Date(`2026-07-24T10:${String(sequence).padStart(2, '0')}:00.000Z`);
  }

  function matches(row: Record<string, unknown>, where?: Record<string, unknown>): boolean {
    if (!where) {
      return true;
    }

    return Object.entries(where).every(([key, expected]) => {
      const actual = row[key];
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if ('in' in expected && Array.isArray((expected as { in?: unknown[] }).in)) {
          return (expected as { in: unknown[] }).in.includes(actual);
        }
      }
      return actual === expected;
    });
  }

  const db = {
    state,
    source: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.sources.filter((row) => matches(row, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const timestamp = now();
        const row = {
          id: nextId('source'),
          createdAt: timestamp,
          updatedAt: timestamp,
          ...data
        };
        state.sources.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.sources.find((entry) => entry.id === where.id);
        if (!row) {
          throw new Error(`source_not_found:${where.id}`);
        }
        Object.assign(row, data, { updatedAt: now() });
        return row;
      }
    },
    agent: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.agents.filter((row) => matches(row, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const timestamp = now();
        const row = {
          id: nextId('agent'),
          createdAt: timestamp,
          updatedAt: timestamp,
          ...data
        };
        state.agents.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.agents.find((entry) => entry.id === where.id);
        if (!row) {
          throw new Error(`agent_not_found:${where.id}`);
        }
        Object.assign(row, data, { updatedAt: now() });
        return row;
      }
    },
    agentPromptVersion: {
      findMany: async ({
        where,
        orderBy
      }: {
        where?: { agentId?: string | { in: string[] } };
        orderBy?: Array<Record<string, 'asc' | 'desc'>>;
      } = {}) => {
        let rows = [...state.agentPromptVersions];
        if (where?.agentId && typeof where.agentId === 'object' && 'in' in where.agentId) {
          rows = rows.filter((row) => where.agentId!.in.includes(String(row.agentId)));
        } else if (typeof where?.agentId === 'string') {
          rows = rows.filter((row) => row.agentId === where.agentId);
        }
        if (orderBy?.length) {
          rows.sort((left, right) => {
            for (const order of orderBy) {
              const [field, direction] = Object.entries(order)[0]!;
              const leftValue = left[field];
              const rightValue = right[field];
              if (leftValue === rightValue) {
                continue;
              }
              if (leftValue === undefined || leftValue === null) {
                return direction === 'asc' ? -1 : 1;
              }
              if (rightValue === undefined || rightValue === null) {
                return direction === 'asc' ? 1 : -1;
              }
              const comparison = leftValue < rightValue ? -1 : 1;
              return direction === 'asc' ? comparison : -comparison;
            }
            return 0;
          });
        }
        return rows;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const timestamp = now();
        const row = {
          id: nextId('agent-version'),
          createdAt: timestamp,
          updatedAt: timestamp,
          publishedAt: timestamp,
          ...data
        };
        state.agentPromptVersions.push(row);
        return row;
      }
    },
    marketplacePublication: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        state.marketplacePublications.filter((row) => matches(row, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const timestamp = now();
        const row = {
          id: nextId('publication'),
          createdAt: timestamp,
          updatedAt: timestamp,
          publishedAt: timestamp,
          retiredAt: null,
          ...data
        };
        state.marketplacePublications.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.marketplacePublications.find((entry) => entry.id === where.id);
        if (!row) {
          throw new Error(`publication_not_found:${where.id}`);
        }
        Object.assign(row, data, { updatedAt: now() });
        return row;
      }
    },
    catalogDemo: {
      findMany: async () =>
        state.catalogDemos.map((row) => ({
          ...row,
          sourcePublication: state.marketplacePublications.find((publication) => publication.id === row.sourcePublicationId) ?? null,
          agentPublication: state.marketplacePublications.find((publication) => publication.id === row.agentPublicationId) ?? null
        })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const timestamp = now();
        const row = {
          id: nextId('demo'),
          createdAt: timestamp,
          updatedAt: timestamp,
          status: 'active',
          ...data
        };
        state.catalogDemos.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.catalogDemos.find((entry) => entry.id === where.id);
        if (!row) {
          throw new Error(`demo_not_found:${where.id}`);
        }
        Object.assign(row, data, { updatedAt: now() });
        return row;
      }
    },
    $transaction: async <T>(callback: (tx: typeof db) => Promise<T>) => callback(db)
  };

  return db;
}

describe('validateCatalog', () => {
  it('accepts the seed bundle', () => {
    expect(validateCatalog(loadSeedBundle())).toEqual([]);
  });

  it('reports duplicate localized slugs', () => {
    const bundle = cloneBundle(loadSeedBundle());
    bundle.sources.push({ ...bundle.sources[0] });

    expect(validateCatalog(bundle)).toContainEqual(expect.objectContaining({ code: 'duplicate_slug' }));
  });

  it('reports missing vendored icons', () => {
    const bundle = cloneBundle(loadSeedBundle());
    bundle.agents[0] = {
      ...bundle.agents[0],
      iconAssetKey: 'missing-icon'
    };

    expect(validateCatalog(bundle)).toContainEqual(expect.objectContaining({ code: 'missing_icon' }));
  });

  it('reports bad demo references and locale mismatches', () => {
    const badReferenceBundle = cloneBundle(loadSeedBundle());
    badReferenceBundle.demos[0] = {
      ...badReferenceBundle.demos[0],
      sourceSlug: 'unknown-source'
    };

    expect(validateCatalog(badReferenceBundle)).toContainEqual(
      expect.objectContaining({ code: 'unknown_demo_reference' })
    );

    const localeMismatchBundle = cloneBundle(loadSeedBundle());
    localeMismatchBundle.demos[0] = {
      ...localeMismatchBundle.demos[0],
      locale: 'fr'
    };

    expect(validateCatalog(localeMismatchBundle)).toContainEqual(
      expect.objectContaining({ code: 'locale_reference_integrity' })
    );
  });
});

describe('renderCatalogPreviewHtml', () => {
  it('escapes content and warns about duplicate icon assignments', () => {
    const bundle = cloneBundle(loadSeedBundle());
    bundle.agents[1] = {
      ...bundle.agents[1],
      iconAssetKey: bundle.agents[0].iconAssetKey,
      title: '<b>Duplicate icon</b>'
    };

    const html = renderCatalogPreviewHtml(bundle);

    expect(html).toContain('&lt;b&gt;Duplicate icon&lt;/b&gt;');
    expect(html).toContain('Duplicate icon assignments');
    expect(html).toContain(bundle.sources[0].title);
    expect(html).toContain(bundle.demos[0].slug);
  });
});

describe('catalog import', () => {
  it('persists curated entries through the current Prisma schema', async () => {
    const bundle = loadSeedBundle();

    await withRealCatalogPrisma('schema', async (db) => {
      const appliedPlan = await applyCatalogImport(db, bundle);
      expect(appliedPlan.creates.length).toBe(bundle.sources.length + bundle.agents.length + bundle.demos.length);
      expect(appliedPlan.versions).toHaveLength(2);

      const sources = await db.source.findMany({
        orderBy: [{ value: 'asc' }]
      });
      expect(sources).toHaveLength(2);
      expect(sources.every((row) => row.ownerUserId === PLATFORM_CATALOG_OWNER_USER_ID)).toBe(true);

      const sourcePublications = await db.marketplacePublication.findMany({
        where: { origin: 'platform_curated', resourceType: 'source' },
        include: { source: true },
        orderBy: [{ slug: 'asc' }, { locale: 'asc' }]
      });
      expect(sourcePublications).toHaveLength(bundle.sources.length);
      expect(sourcePublications.every((row) => row.publisherUserId === PLATFORM_CATALOG_OWNER_USER_ID)).toBe(true);
      expect(sourcePublications.every((row) => row.resourceId === row.sourceId)).toBe(true);
      expect(sourcePublications.every((row) => row.source?.ownerUserId === PLATFORM_CATALOG_OWNER_USER_ID)).toBe(true);

      const agents = await db.agent.findMany({
        orderBy: [{ name: 'asc' }]
      });
      expect(agents).toHaveLength(2);
      expect(agents.every((row) => row.ownerUserId === PLATFORM_CATALOG_OWNER_USER_ID)).toBe(true);

      const versions = await db.agentPromptVersion.findMany({
        orderBy: [{ agentId: 'asc' }, { version: 'asc' }]
      });
      expect(versions).toHaveLength(2);
      expect(versions.every((row) => row.version === 1)).toBe(true);
      expect(versions.every((row) => row.publishedAt instanceof Date)).toBe(true);
      expect(versions.every((row) => typeof row.iconAssetKey === 'string' && row.iconAssetKey.length > 0)).toBe(true);

      const agentPublications = await db.marketplacePublication.findMany({
        where: { origin: 'platform_curated', resourceType: 'agent' },
        include: { agentVersion: true },
        orderBy: [{ slug: 'asc' }, { locale: 'asc' }]
      });
      expect(agentPublications).toHaveLength(bundle.agents.length);
      expect(agentPublications.every((row) => row.publisherUserId === PLATFORM_CATALOG_OWNER_USER_ID)).toBe(true);
      expect(agentPublications.every((row) => row.resourceId === row.agentId)).toBe(true);
      expect(agentPublications.every((row) => row.agentVersionId && row.agentVersion?.version === 1)).toBe(true);

      const demos = await db.catalogDemo.findMany({
        orderBy: [{ slug: 'asc' }, { locale: 'asc' }]
      });
      expect(demos).toHaveLength(bundle.demos.length);

      const postApplyPlan = await planCatalogImport(db, bundle);
      expect(postApplyPlan).toEqual({
        creates: [],
        updates: [],
        versions: [],
        retirements: []
      });
    });
  });

  it('runs apply mode end-to-end through the CLI', async () => {
    await withCatalogDatabase('cli', async ({ databaseUrl }) => {
      const firstRun = runCatalogImportCli(databaseUrl, '--apply');
      expect(firstRun.status).toBe(0);
      expect(firstRun.stderr.trim()).toBe('');
      expect(JSON.parse(firstRun.stdout) as CatalogImportPlan).toEqual(
        expect.objectContaining({
          creates: expect.any(Array),
          updates: expect.any(Array),
          versions: expect.any(Array),
          retirements: expect.any(Array)
        })
      );

      const db = new PrismaClient({ datasourceUrl: databaseUrl });
      try {
        expect(await db.marketplacePublication.count({ where: { origin: 'platform_curated' } })).toBe(8);
      } finally {
        await db.$disconnect();
      }

      const secondRun = runCatalogImportCli(databaseUrl, '--apply');
      expect(secondRun.status).toBe(0);
      expect(JSON.parse(secondRun.stdout) as CatalogImportPlan).toEqual({
        creates: [],
        updates: [],
        versions: [],
        retirements: []
      });
    });
  });

  it('creates new immutable agent versions only when execution snapshots change', async () => {
    const bundle = loadSeedBundle();
    const db = createFakeCatalogDb();

    await applyCatalogImport(db as never, bundle);

    const repeatPlan = await planCatalogImport(db as never, bundle);
    expect(repeatPlan.versions).toEqual([]);

    const changedBundle = cloneBundle(bundle);
    changedBundle.agents = changedBundle.agents.map((entry) =>
      entry.slug === 'market-analyst'
        ? {
            ...entry,
            promptSnapshot: {
              ...entry.promptSnapshot,
              systemPrompt: `${entry.promptSnapshot.systemPrompt}\nFocus on capital allocation.`
            }
          }
        : entry
    );

    const versionPlan = await planCatalogImport(db as never, changedBundle);
    expect(versionPlan.versions).toContainEqual(
      expect.objectContaining({
        entityType: 'agentVersion',
        stableKey: 'agent-version:market-analyst'
      })
    );

    const versionCountBeforeApply = db.state.agentPromptVersions.length;
    await applyCatalogImport(db as never, changedBundle);
    expect(db.state.agentPromptVersions).toHaveLength(versionCountBeforeApply + 1);
  });

  it('is idempotent and retires missing curated publications without deleting canonical rows', async () => {
    const bundle = loadSeedBundle();
    const db = createFakeCatalogDb();

    const firstPlan = await planCatalogImport(db as never, bundle);
    expect(firstPlan.creates.length).toBeGreaterThan(0);

    await applyCatalogImport(db as never, bundle);

    const secondPlan = await planCatalogImport(db as never, bundle);
    expect(secondPlan).toEqual({
      creates: [],
      updates: [],
      versions: [],
      retirements: []
    });

    const retiredBundle = cloneBundle(bundle);
    retiredBundle.sources = retiredBundle.sources.filter(
      (entry) => !(entry.slug === 'knowledge-project' && entry.locale === 'de')
    );

    const knowledgeSource = db.state.sources.find((row) => row.value === 'https://example.com/knowledge.xml');
    expect(knowledgeSource).toBeTruthy();
    db.state.userLibrarySources.push({
      userId: 'user-1',
      sourceId: String(knowledgeSource!.id)
    });

    const retirementPlan = await planCatalogImport(db as never, retiredBundle);
    expect(retirementPlan.creates).toEqual([]);
    expect(retirementPlan.versions).toEqual([]);
    expect(retirementPlan.retirements).toHaveLength(1);
    expect(retirementPlan.retirements[0]).toEqual(
      expect.objectContaining({
        entityType: 'sourcePublication',
        stableKey: 'source-publication:knowledge-project:de:v1'
      })
    );

    await applyCatalogImport(db as never, retiredBundle);

    expect(db.state.sources.some((row) => row.id === knowledgeSource!.id)).toBe(true);
    expect(db.state.userLibrarySources).toContainEqual({
      userId: 'user-1',
      sourceId: String(knowledgeSource!.id)
    });
  });
});
