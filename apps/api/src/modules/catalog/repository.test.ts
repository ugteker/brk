import { describe, expect, it, vi } from 'vitest';
import { CatalogRepository } from './repository';

function createPublicationRows() {
  const now = new Date('2026-07-24T09:00:00.000Z');
  return [
    {
      id: 'source-pub-acquired-en',
      publisherUserId: 'platform',
      resourceType: 'source',
      resourceId: 'source-1',
      title: 'Acquired',
      summary: 'English source copy',
      visibility: 'public',
      status: 'published',
      publishedAt: now,
      retiredAt: null,
      createdAt: now,
      updatedAt: now,
      slug: 'acquired',
      catalogVersion: 1,
      origin: 'platform_curated',
      locale: 'en',
      sourceTypesJson: JSON.stringify(['web_urls']),
      topicsJson: JSON.stringify(['m&a']),
      iconAssetKey: null,
      editorialRank: 1,
      agentVersionId: null,
      source: {
        id: 'source-1',
        ownerUserId: 'platform',
        type: 'web_urls',
        value: 'https://example.com/acquired',
        status: 'active',
        configJson: JSON.stringify({
          libraryCard: {
            title: 'Acquired',
            coverImageUrl: 'https://cdn.example.com/acquired.png',
            previewItems: [{ title: 'Deal closes', link: 'https://example.com/acquired/post', pubDate: '2026-07-24T00:00:00.000Z' }]
          }
        }),
        createdAt: now,
        updatedAt: now,
        libraryMemberships: []
      },
      agent: null,
      playbook: null,
      agentVersion: null
    },
    {
      id: 'source-pub-acquired-de',
      publisherUserId: 'platform',
      resourceType: 'source',
      resourceId: 'source-1',
      title: 'Übernahme',
      summary: 'Deutsche Quellenbeschreibung',
      visibility: 'public',
      status: 'published',
      publishedAt: now,
      retiredAt: null,
      createdAt: now,
      updatedAt: now,
      slug: 'acquired',
      catalogVersion: 1,
      origin: 'platform_curated',
      locale: 'de',
      sourceTypesJson: JSON.stringify(['web_urls']),
      topicsJson: JSON.stringify(['m&a']),
      iconAssetKey: null,
      editorialRank: 1,
      agentVersionId: null,
      source: {
        id: 'source-1',
        ownerUserId: 'platform',
        type: 'web_urls',
        value: 'https://example.com/acquired',
        status: 'active',
        configJson: JSON.stringify({
          libraryCard: {
            title: 'Übernahme',
            coverImageUrl: 'https://cdn.example.com/acquired.png',
            previewItems: [{ title: 'Deal closes', link: 'https://example.com/acquired/post', pubDate: '2026-07-24T00:00:00.000Z' }]
          }
        }),
        createdAt: now,
        updatedAt: now,
        libraryMemberships: []
      },
      agent: null,
      playbook: null,
      agentVersion: null
    },
    {
      id: 'source-pub-knowledge-en',
      publisherUserId: 'platform',
      resourceType: 'source',
      resourceId: 'source-2',
      title: 'Knowledge project',
      summary: 'English fallback source copy',
      visibility: 'public',
      status: 'published',
      publishedAt: now,
      retiredAt: null,
      createdAt: now,
      updatedAt: now,
      slug: 'knowledge-project',
      catalogVersion: 1,
      origin: 'platform_curated',
      locale: 'en',
      sourceTypesJson: JSON.stringify(['podcast_feeds']),
      topicsJson: JSON.stringify(['research']),
      iconAssetKey: null,
      editorialRank: 2,
      agentVersionId: null,
      source: {
        id: 'source-2',
        ownerUserId: 'platform',
        type: 'podcast_feeds',
        value: 'https://example.com/knowledge.xml',
        status: 'active',
        configJson: JSON.stringify({
          libraryCard: {
            title: 'Knowledge project',
            coverImageUrl: null,
            previewItems: []
          }
        }),
        createdAt: now,
        updatedAt: now,
        libraryMemberships: [{ userId: 'user-1', sourceId: 'source-2' }]
      },
      agent: null,
      playbook: null,
      agentVersion: null
    },
    {
      id: 'source-pub-retired-en',
      publisherUserId: 'platform',
      resourceType: 'source',
      resourceId: 'source-3',
      title: 'Retired source',
      summary: 'Should not surface',
      visibility: 'public',
      status: 'published',
      publishedAt: now,
      retiredAt: new Date('2026-07-24T10:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
      slug: 'retired-source',
      catalogVersion: 1,
      origin: 'platform_curated',
      locale: 'en',
      sourceTypesJson: JSON.stringify(['web_urls']),
      topicsJson: JSON.stringify(['ignore']),
      iconAssetKey: null,
      editorialRank: 0,
      agentVersionId: null,
      source: {
        id: 'source-3',
        ownerUserId: 'platform',
        type: 'web_urls',
        value: 'https://example.com/retired',
        status: 'active',
        configJson: JSON.stringify({ libraryCard: { title: 'Retired', coverImageUrl: null, previewItems: [] } }),
        createdAt: now,
        updatedAt: now,
        libraryMemberships: []
      },
      agent: null,
      playbook: null,
      agentVersion: null
    },
    {
      id: 'agent-pub-analyst-en',
      publisherUserId: 'platform',
      resourceType: 'agent',
      resourceId: 'agent-1',
      title: 'Market analyst',
      summary: 'English analyst copy',
      visibility: 'public',
      status: 'published',
      publishedAt: now,
      retiredAt: null,
      createdAt: now,
      updatedAt: now,
      slug: 'market-analyst',
      catalogVersion: 2,
      origin: 'platform_curated',
      locale: 'en',
      sourceTypesJson: JSON.stringify(['web_urls', 'podcast_feeds']),
      topicsJson: JSON.stringify(['m&a']),
      iconAssetKey: 'chart-line',
      editorialRank: 1,
      agentVersionId: 'version-2',
      source: null,
      playbook: null,
      agent: {
        id: 'agent-1',
        ownerUserId: 'platform',
        name: 'Market analyst',
        description: 'Mutable row should not drive response copy',
        characterType: 'summarizer',
        promptConfigJson: '{}',
        status: 'active',
        preferencesJson: '{}',
        createdAt: now,
        updatedAt: now
      },
      agentVersion: {
        id: 'version-2',
        agentId: 'agent-1',
        version: 2,
        model: 'claude-sonnet-4-5',
        systemPrompt: '...',
        name: 'Market analyst v2',
        description: 'Immutable version',
        characterType: 'summarizer',
        promptConfigJson: '{}',
        iconAssetKey: 'chart-line',
        basedOnAgentVersionId: null,
        enabled: true,
        curationSessionId: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        libraryMemberships: [{ userId: 'user-1', agentVersionId: 'version-2' }]
      }
    },
    {
      id: 'agent-pub-analyst-de',
      publisherUserId: 'platform',
      resourceType: 'agent',
      resourceId: 'agent-1',
      title: 'Marktanalyst',
      summary: 'Deutsche Analystenbeschreibung',
      visibility: 'public',
      status: 'published',
      publishedAt: now,
      retiredAt: null,
      createdAt: now,
      updatedAt: now,
      slug: 'market-analyst',
      catalogVersion: 2,
      origin: 'platform_curated',
      locale: 'de',
      sourceTypesJson: JSON.stringify(['web_urls', 'podcast_feeds']),
      topicsJson: JSON.stringify(['m&a']),
      iconAssetKey: 'chart-line',
      editorialRank: 1,
      agentVersionId: 'version-2',
      source: null,
      playbook: null,
      agent: {
        id: 'agent-1',
        ownerUserId: 'platform',
        name: 'Market analyst',
        description: 'Mutable row should not drive response copy',
        characterType: 'summarizer',
        promptConfigJson: '{}',
        status: 'active',
        preferencesJson: '{}',
        createdAt: now,
        updatedAt: now
      },
      agentVersion: {
        id: 'version-2',
        agentId: 'agent-1',
        version: 2,
        model: 'claude-sonnet-4-5',
        systemPrompt: '...',
        name: 'Market analyst v2',
        description: 'Immutable version',
        characterType: 'summarizer',
        promptConfigJson: '{}',
        iconAssetKey: 'chart-line',
        basedOnAgentVersionId: null,
        enabled: true,
        curationSessionId: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        libraryMemberships: [{ userId: 'user-1', agentVersionId: 'version-2' }]
      }
    },
    {
      id: 'agent-pub-disabled-en',
      publisherUserId: 'platform',
      resourceType: 'agent',
      resourceId: 'agent-2',
      title: 'Disabled agent',
      summary: 'Should not surface',
      visibility: 'public',
      status: 'published',
      publishedAt: now,
      retiredAt: null,
      createdAt: now,
      updatedAt: now,
      slug: 'disabled-agent',
      catalogVersion: 1,
      origin: 'platform_curated',
      locale: 'en',
      sourceTypesJson: JSON.stringify(['youtube_videos']),
      topicsJson: JSON.stringify(['ignore']),
      iconAssetKey: 'video',
      editorialRank: 0,
      agentVersionId: 'version-disabled',
      source: null,
      playbook: null,
      agent: {
        id: 'agent-2',
        ownerUserId: 'platform',
        name: 'Disabled agent',
        description: '',
        characterType: 'summarizer',
        promptConfigJson: '{}',
        status: 'disabled',
        preferencesJson: '{}',
        createdAt: now,
        updatedAt: now
      },
      agentVersion: {
        id: 'version-disabled',
        agentId: 'agent-2',
        version: 1,
        model: 'claude-sonnet-4-5',
        systemPrompt: '...',
        name: 'Disabled',
        description: '',
        characterType: 'summarizer',
        promptConfigJson: '{}',
        iconAssetKey: 'video',
        basedOnAgentVersionId: null,
        enabled: false,
        curationSessionId: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        libraryMemberships: []
      }
    }
  ];
}

function createDemoRows(publications: ReturnType<typeof createPublicationRows>) {
  const now = new Date('2026-07-24T09:00:00.000Z');
  const sourceDe = publications.find((row) => row.id === 'source-pub-acquired-de')!;
  const sourceEn = publications.find((row) => row.id === 'source-pub-acquired-en')!;
  const agentDe = publications.find((row) => row.id === 'agent-pub-analyst-de')!;
  const agentEn = publications.find((row) => row.id === 'agent-pub-analyst-en')!;
  const retiredSource = publications.find((row) => row.id === 'source-pub-retired-en')!;

  return [
    {
      id: 'demo-1-de',
      slug: 'acquired-analyst-demo',
      sourcePublicationId: sourceDe.id,
      agentPublicationId: agentDe.id,
      locale: 'de',
      title: 'Beispielbericht',
      disclosure: 'Beispielbericht',
      reportJson: JSON.stringify({ headline: 'Deutsches Demo', report: { summary: 'Nur Demo' } }),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      sourcePublication: sourceDe,
      agentPublication: agentDe
    },
    {
      id: 'demo-1-en',
      slug: 'acquired-analyst-demo',
      sourcePublicationId: sourceEn.id,
      agentPublicationId: agentEn.id,
      locale: 'en',
      title: 'Sample report',
      disclosure: 'Sample report',
      reportJson: JSON.stringify({ headline: 'English demo', report: { summary: 'Demo only' } }),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      sourcePublication: sourceEn,
      agentPublication: agentEn
    },
    {
      id: 'demo-retired-en',
      slug: 'retired-demo',
      sourcePublicationId: retiredSource.id,
      agentPublicationId: agentEn.id,
      locale: 'en',
      title: 'Retired demo',
      disclosure: 'Retired demo',
      reportJson: JSON.stringify({ headline: 'Should not surface' }),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      sourcePublication: retiredSource,
      agentPublication: agentEn
    }
  ];
}

function createDb() {
  const publications = createPublicationRows();
  const demos = createDemoRows(publications);

  const publicationMatches = (row: any, where: any) =>
    row.resourceType === where.resourceType &&
    row.status === where.status &&
    row.visibility === where.visibility &&
    row.origin === where.origin &&
    row.retiredAt === where.retiredAt &&
    where.locale.in.includes(row.locale) &&
    (row.resourceType !== 'source' || row.source?.status === where.source?.is?.status) &&
    (row.resourceType !== 'agent' ||
      (row.agent?.status === where.agent?.is?.status &&
        row.agentVersionId !== null &&
        row.agentVersion?.enabled === where.agentVersion?.is?.enabled));

  const demoMatches = (row: any, where: any) =>
    row.status === where.status &&
    where.locale.in.includes(row.locale) &&
    row.sourcePublication.retiredAt === where.sourcePublication.is.retiredAt &&
    row.sourcePublication.status === where.sourcePublication.is.status &&
    row.sourcePublication.visibility === where.sourcePublication.is.visibility &&
    row.sourcePublication.origin === where.sourcePublication.is.origin &&
    row.sourcePublication.source.status === where.sourcePublication.is.source.is.status &&
    row.agentPublication.retiredAt === where.agentPublication.is.retiredAt &&
    row.agentPublication.status === where.agentPublication.is.status &&
    row.agentPublication.visibility === where.agentPublication.is.visibility &&
    row.agentPublication.origin === where.agentPublication.is.origin &&
    row.agentPublication.agent.status === where.agentPublication.is.agent.is.status &&
    row.agentPublication.agentVersion.enabled === where.agentPublication.is.agentVersion.is.enabled;

  return {
    marketplacePublication: {
      findMany: async ({ where }: { where: any }) => publications.filter((row) => publicationMatches(row, where))
    },
    catalogDemo: {
      findMany: async ({ where }: { where: any }) => demos.filter((row) => demoMatches(row, where))
    }
  };
}

describe('CatalogRepository', () => {
  it('returns active curated publications in editorial order with locale fallback, saved flags, and frozen demo JSON', async () => {
    const repository = new CatalogRepository(createDb() as never);

    const catalog = await repository.getCatalog({ userId: 'user-1', locale: 'de' });

    expect(catalog.sources.map((entry) => entry.slug)).toEqual(['acquired', 'knowledge-project']);
    expect(catalog.sources[0]).toMatchObject({
      publicationId: 'source-pub-acquired-de',
      title: 'Übernahme',
      summary: 'Deutsche Quellenbeschreibung',
      saved: false
    });
    expect(catalog.sources[1]).toMatchObject({
      publicationId: 'source-pub-knowledge-en',
      title: 'Knowledge project',
      saved: true
    });
    expect(catalog.agents).toHaveLength(1);
    expect(catalog.agents[0]).toMatchObject({
      publicationId: 'agent-pub-analyst-de',
      slug: 'market-analyst',
      agentVersionId: 'version-2',
      title: 'Marktanalyst',
      saved: true
    });
    expect(catalog.demos).toEqual([
      expect.objectContaining({
        slug: 'acquired-analyst-demo',
        title: 'Beispielbericht',
        disclosure: 'Beispielbericht',
        report: { headline: 'Deutsches Demo', report: { summary: 'Nur Demo' } }
      })
    ]);
  });

  it('surfaces malformed persisted demo JSON instead of silently defaulting it', async () => {
    const db = createDb() as any;
    db.catalogDemo.findMany = async () => [
      {
        id: 'demo-bad',
        slug: 'bad-demo',
        sourcePublicationId: 'source-pub-acquired-en',
        agentPublicationId: 'agent-pub-analyst-en',
        locale: 'en',
        title: 'Broken',
        disclosure: 'Broken',
        reportJson: '{"headline":',
        status: 'active',
        createdAt: new Date('2026-07-24T09:00:00.000Z'),
        updatedAt: new Date('2026-07-24T09:00:00.000Z'),
        sourcePublication: createPublicationRows().find((row) => row.id === 'source-pub-acquired-en'),
        agentPublication: createPublicationRows().find((row) => row.id === 'agent-pub-analyst-en')
      }
    ];
    const repository = new CatalogRepository(db);

    await expect(repository.getCatalog({ userId: 'user-1', locale: 'en' })).rejects.toThrow('invalid_catalog_demo_report');
  });

  it('merges duplicate owned+curated candidates preserving best editorial rank in ordering', async () => {
    const now = new Date('2026-07-24T09:00:00.000Z');
    const sourceRow = {
      id: 'source-1',
      type: 'web_urls',
      value: 'https://example.com/owned',
      status: 'active',
      ownerUserId: 'user-1',
      libraryMemberships: []
    };

    const curatedAgentRows = [
      {
        id: 'agent-pub-curated-dup',
        publisherUserId: 'platform',
        resourceType: 'agent',
        resourceId: 'agent-dup',
        title: 'Curated Dup',
        summary: 'curated',
        visibility: 'public',
        status: 'published',
        publishedAt: now,
        retiredAt: null,
        createdAt: now,
        updatedAt: now,
        slug: 'dup',
        catalogVersion: 1,
        origin: 'platform_curated',
        locale: 'en',
        sourceTypesJson: JSON.stringify(['web_urls']),
        topicsJson: JSON.stringify(['m&a']),
        iconAssetKey: null,
        editorialRank: 1,
        agentVersionId: 'version-dup',
        agent: { id: 'agent-dup', ownerUserId: 'platform', name: 'Dup', description: 'desc', characterType: 'summarizer', createdAt: now, updatedAt: now },
        agentVersion: { id: 'version-dup', agentId: 'agent-dup', name: 'Dup v', description: 'v', characterType: 'summarizer', iconAssetKey: null, enabled: true, createdAt: now, updatedAt: now, libraryMemberships: [] }
      },
      {
        id: 'agent-pub-other',
        publisherUserId: 'platform',
        resourceType: 'agent',
        resourceId: 'agent-other',
        title: 'Other',
        summary: 'other',
        visibility: 'public',
        status: 'published',
        publishedAt: now,
        retiredAt: null,
        createdAt: now,
        updatedAt: now,
        slug: 'other',
        catalogVersion: 1,
        origin: 'platform_curated',
        locale: 'en',
        sourceTypesJson: JSON.stringify(['web_urls']),
        topicsJson: JSON.stringify(['m&a']),
        iconAssetKey: null,
        editorialRank: 5,
        agentVersionId: 'other',
        agent: { id: 'agent-other', ownerUserId: 'platform', name: 'Other', description: 'desc', characterType: 'summarizer', createdAt: now, updatedAt: now },
        agentVersion: { id: 'other', agentId: 'agent-other', name: 'Other v', description: 'v', characterType: 'summarizer', iconAssetKey: null, enabled: true, createdAt: now, updatedAt: now, libraryMemberships: [] }
      }
    ];

    const ownedVersionRows = [
      {
        id: 'version-dup',
        name: '',
        description: '',
        agent: { ownerUserId: 'user-1', status: 'active', name: 'Owned Dup', description: 'Owned description' },
        catalogPublications: [
          { id: 'agent-pub-owned', locale: 'en', sourceTypesJson: JSON.stringify(['web_urls']), topicsJson: JSON.stringify([]), iconAssetKey: null, editorialRank: 10, status: 'published', retiredAt: null, catalogVersion: 1 }
        ],
        basedOnAgentVersion: null,
        libraryMemberships: []
      }
    ];

    const marketplaceFindMany = vi.fn(async ({ where }: any) => {
      if (where.resourceType === 'agent' && where.agentVersion?.is) return curatedAgentRows;
      return [];
    });
    const db = {
      source: {
        findFirst: async () => sourceRow
      },
      marketplacePublication: {
        findMany: marketplaceFindMany
      },
      agentPromptVersion: {
        findMany: async () => ownedVersionRows
      }
    } as any;

    const repository = new CatalogRepository(db);
    const matches = await repository.getAgentMatches({ userId: 'user-1', sourceId: 'source-1' });
    expect(matches.map((m) => m.agentVersionId)).toEqual(['version-dup', 'other']);
    expect(matches[0]).toMatchObject({ name: 'Owned Dup', purpose: 'Owned description', ownership: 'owned' });
    const curatedQuery = marketplaceFindMany.mock.calls.find(([args]) => args.where.origin === 'platform_curated');
    expect(curatedQuery?.[0].where).not.toHaveProperty('locale');
  });

  it('saves the version and creates a manual playbook for the selected source', async () => {
    const savedAt = new Date('2026-07-24T09:05:00.000Z');
    const playbookCreate = vi.fn(async ({ data }: any) => ({
      id: 'playbook-1',
      agentId: data.agentId,
      agentVersionId: data.agentVersionId,
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      notificationsEnabled: data.notificationsEnabled ?? true,
      digestFrequency: data.digestFrequency ?? 'immediate',
      lastDigestSentAt: null,
      mode: data.mode,
      intervalMinutes: data.intervalMinutes ?? null,
      dailyTime: data.dailyTime ?? null,
      timezone: data.timezone ?? null,
      daysOfWeekJson: data.daysOfWeekJson ?? null,
      nextRunAt: data.nextRunAt ?? null,
      recipientsJson: data.recipientsJson ?? '[]',
      executionMode: data.executionMode,
      maxSourcesPerRun: data.maxSourcesPerRun,
      maxItemsPerSource: data.maxItemsPerSource,
      followTargetType: data.followTargetType ?? null,
      followTargetKey: data.followTargetKey ?? null,
      followTargetTitle: data.followTargetTitle ?? null,
      language: data.language,
      createdAt: savedAt,
      updatedAt: savedAt,
      sources: [{ sourceId: 'source-1' }],
      agent: { runs: [] }
    }));
    const db: any = {
      source: {
        findFirst: vi.fn(async () => ({ id: 'source-1', type: 'web_urls', value: 'https://example.com/source', status: 'active', ownerUserId: 'user-1' }))
      },
      agentPromptVersion: {
        findUnique: vi.fn(async () => ({
          id: 'version-3',
          agentId: 'agent-1',
          name: '',
          description: '',
          agent: { id: 'agent-1', name: 'My own analyst', description: 'My own description', ownerUserId: 'user-1', status: 'active' }
        }))
      },
      marketplacePublication: {
        findFirst: vi.fn(async () => ({ id: 'pub-1' }))
      },
      userLibraryAgent: {
        upsert: vi.fn(async () => ({ id: 'saved-1' }))
      },
      playbook: {
        findFirst: vi.fn(async () => null),
        create: playbookCreate
      },
      realtimeEvent: {
        create: vi.fn(async () => ({ id: 1 }))
      }
    };
    db.$transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));

    const repository = new CatalogRepository(db);
    const result = await repository.useAgentForSource({
      userId: 'user-1',
      sourceId: 'source-1',
      agentVersionId: 'version-3'
    });

    expect(result.created).toBe(true);
    expect(result.playbook.schedule).toEqual({ mode: 'manual' });
    expect(result.playbook.agentVersionId).toBe('version-3');
    expect(result.playbook.name).toBe('My own analyst');
    expect(result.playbook.description).toBe('My own description');
    expect(result.playbook.nextRunAt).toBeNull();
    expect(db.userLibraryAgent.upsert).toHaveBeenCalledWith({
      where: {
        userId_agentVersionId: {
          userId: 'user-1',
          agentVersionId: 'version-3'
        }
      },
      create: { userId: 'user-1', agentVersionId: 'version-3', savedAt: expect.any(Date) },
      update: { savedAt: expect.any(Date) }
    });
    expect(playbookCreate).toHaveBeenCalledTimes(1);
    expect(db.realtimeEvent.create).toHaveBeenCalledTimes(1);
  });

  it('upserts saved-agent membership in the same transaction', async () => {
    const db: any = {
      source: {
        findFirst: vi.fn(async () => ({ id: 'source-1', type: 'web_urls', value: 'https://example.com/source', status: 'active', ownerUserId: 'user-1' }))
      },
      agentPromptVersion: {
        findUnique: vi.fn(async () => ({
          id: 'version-3',
          agentId: 'agent-1',
          name: 'Market analyst v3',
          description: 'Pinned version',
          agent: { id: 'agent-1', ownerUserId: 'platform', status: 'active' }
        }))
      },
      marketplacePublication: {
        findFirst: vi.fn(async () => ({ id: 'pub-1' }))
      },
      userLibraryAgent: {
        upsert: vi.fn(async () => ({ id: 'saved-1' }))
      },
      playbook: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: 'playbook-1',
          agentId: 'agent-1',
          agentVersionId: 'version-3',
          name: 'Market analyst v3',
          description: '',
          enabled: true,
          notificationsEnabled: true,
          digestFrequency: 'immediate',
          lastDigestSentAt: null,
          mode: 'manual',
          intervalMinutes: null,
          dailyTime: null,
          timezone: null,
          daysOfWeekJson: null,
          nextRunAt: null,
          recipientsJson: '[]',
          executionMode: 'latest_only',
          maxSourcesPerRun: 3,
          maxItemsPerSource: 1,
          followTargetType: null,
          followTargetKey: null,
          followTargetTitle: null,
          language: 'en',
          createdAt: new Date('2026-07-24T09:05:00.000Z'),
          updatedAt: new Date('2026-07-24T09:05:00.000Z'),
          sources: [{ sourceId: 'source-1' }],
          agent: { runs: [] }
        }))
      },
      realtimeEvent: {
        create: vi.fn(async () => ({ id: 1 }))
      }
    };
    db.$transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));

    const repository = new CatalogRepository(db);
    await repository.useAgentForSource({
      userId: 'user-1',
      sourceId: 'source-1',
      agentVersionId: 'version-3'
    });

    expect(db.userLibraryAgent.upsert).toHaveBeenCalledWith({
      where: {
        userId_agentVersionId: {
          userId: 'user-1',
          agentVersionId: 'version-3'
        }
      },
      create: {
        userId: 'user-1',
        agentVersionId: 'version-3',
        savedAt: expect.any(Date)
      },
      update: {
        savedAt: expect.any(Date)
      }
    });
  });

  it('returns the existing equivalent manual playbook without creating duplicates', async () => {
    const existingPlaybook = {
      id: 'playbook-existing',
      agentId: 'agent-1',
      agentVersionId: 'version-3',
      name: 'Market analyst v3',
      description: '',
      enabled: true,
      notificationsEnabled: true,
      digestFrequency: 'immediate',
      lastDigestSentAt: null,
      mode: 'manual',
      intervalMinutes: null,
      dailyTime: null,
      timezone: null,
      daysOfWeekJson: null,
      nextRunAt: null,
      recipientsJson: '[]',
      executionMode: 'latest_only',
      maxSourcesPerRun: 3,
      maxItemsPerSource: 1,
      followTargetType: null,
      followTargetKey: null,
      followTargetTitle: null,
      language: 'en',
      createdAt: new Date('2026-07-24T09:05:00.000Z'),
      updatedAt: new Date('2026-07-24T09:05:00.000Z'),
      sources: [{ sourceId: 'source-1' }],
      agent: { runs: [] }
    };
    const db: any = {
      source: {
        findFirst: vi.fn(async () => ({ id: 'source-1', type: 'web_urls', value: 'https://example.com/source', status: 'active', ownerUserId: 'user-1' }))
      },
      agentPromptVersion: {
        findUnique: vi.fn(async () => ({
          id: 'version-3',
          agentId: 'agent-1',
          name: 'Market analyst v3',
          description: 'Pinned version',
          agent: { id: 'agent-1', ownerUserId: 'platform', status: 'active' }
        }))
      },
      marketplacePublication: {
        findFirst: vi.fn(async () => ({ id: 'pub-1' }))
      },
      userLibraryAgent: {
        upsert: vi.fn(async () => ({ id: 'saved-1' }))
      },
      playbook: {
        findFirst: vi.fn(async () => existingPlaybook),
        create: vi.fn(async () => {
          throw new Error('unused');
        })
      },
      realtimeEvent: {
        create: vi.fn(async () => ({ id: 1 }))
      }
    };
    db.$transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));

    const repository = new CatalogRepository(db);
    const result = await repository.useAgentForSource({
      userId: 'user-1',
      sourceId: 'source-1',
      agentVersionId: 'version-3'
    });

    expect(result.created).toBe(false);
    expect(result.playbook.id).toBe('playbook-existing');
    expect(db.userLibraryAgent.upsert).toHaveBeenCalledTimes(1);
    expect(db.playbook.create).not.toHaveBeenCalled();
    expect(db.realtimeEvent.create).toHaveBeenCalledTimes(1);
  });
});
