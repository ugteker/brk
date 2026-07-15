import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AgentRunner } from './agent-runner';
import { ClaudeClient } from './claude-client';
import { AgentRepository } from '../agents/repository';
import { PromptRepository } from '../prompts/repository';
import { ArtifactRepository } from '../artifacts/repository';
import { ReportRepository } from '../reports/repository';
import type { SourceAdapter } from './types';

/**
 * In-memory fake standing in for the Prisma client used by each real repository class.
 * This exercises the actual repository query/shape logic (not hand-rolled test doubles),
 * while a stubbed Claude messages client removes the live Anthropic API dependency.
 */
function createFakeDb() {
  const agents = new Map<string, any>();
  const promptVersions: any[] = [];
  const artifacts: any[] = [];
  const reports: any[] = [];

  return {
    agents,
    agent: {
      findUnique: async ({ where }: { where: { id: string } }) => agents.get(where.id) ?? null
    },
    agentPromptVersion: {
      findFirst: async ({ where }: { where: { agentId: string } }) => {
        const versions = promptVersions.filter((v) => v.agentId === where.agentId).sort((a, b) => b.version - a.version);
        return versions[0] ?? null;
      },
      create: async ({ data }: { data: any }) => {
        const row = { id: randomUUID(), createdAt: new Date(), ...data };
        promptVersions.push(row);
        return row;
      }
    },
    agentRunArtifact: {
      create: async ({ data }: { data: any }) => {
        const row = { id: randomUUID(), createdAt: new Date(), ...data };
        artifacts.push(row);
        return row;
      }
    },
    agentRunReport: {
      create: async ({ data }: { data: any }) => {
        const row = {
          id: randomUUID(),
          createdAt: new Date(),
          ...data,
          signals: (data.signals?.create ?? []).map((s: any) => ({ ...s }))
        };
        reports.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { agentId: string } }) => {
        const matches = reports.filter((r) => r.agentId === where.agentId).sort((a, b) => b.createdAt - a.createdAt);
        return matches[0] ?? null;
      }
    }
  };
}

describe('AgentRunner (integration with real repositories)', () => {
  it('runs an agent end-to-end with a stubbed Claude client and persists via real repositories', async () => {
    const db = createFakeDb();

    const agentId = 'agent-1';
    db.agents.set(agentId, {
      id: agentId,
      ownerUserId: 'admin-user-id',
      name: 'Podcast Signals Agent',
      characterType: 'finance_expert',
      promptConfigJson: '{}',
      status: 'active',
      description: '',
      preferencesJson: '{}',
      recipientsJson: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: [{ type: 'web_urls', value: 'https://example.com/episode' }]
    });

    const agentRepository = new AgentRepository(db as never);
    const promptRepository = new PromptRepository(db as never);
    const artifactRepository = new ArtifactRepository(db as never);
    const reportRepository = new ReportRepository(db as never);

    await promptRepository.savePromptVersion(agentId, {
      model: 'claude-sonnet-4-5',
      systemPrompt: 'Decide long/short stock signals from the evidence, with citations.',
      enabled: true
    });

    const claudeClient = new ClaudeClient({
      client: {
        messages: {
          create: async () => ({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'Positive sentiment on ACME driven by earnings beat discussion.',
                  signals: [
                    {
                      symbol: 'ACME',
                      side: 'long',
                      confidence: 82,
                      rationale: 'Hosts cited a strong earnings beat and raised guidance.',
                      citations: ['https://example.com/episode']
                    }
                  ],
                  sourceWarnings: [],
                  needsHumanReview: false
                })
              }
            ]
          })
        }
      }
    });

    const webUrlAdapter: SourceAdapter = {
      fetch: async (_agentId, source) => ({
        evidence: [
          {
            sourceId: source.value,
            sourceType: 'web_urls',
            sourceRef: source.value,
            content: 'Hosts discuss ACME earnings beat and raise guidance for next quarter.',
            fidelity: 'high',
            citations: [source.value]
          }
        ]
      })
    };

    const cursorRepository = { getCursor: async () => null, saveCursor: async () => undefined, touchCrawlAttempt: async () => undefined };

    const runner = new AgentRunner({
      agentRepository,
      promptRepository,
      artifactRepository,
      reportRepository,
      claudeClient,
      cursorRepository,
      sourceAdapters: {
        web_urls: webUrlAdapter,
        podcast_feeds: { fetch: async () => ({ evidence: [] }) },
        youtube_videos: { fetch: async () => ({ evidence: [] }) }
      }
    });

    const result = await runner.run(agentId, 'run-1');

    expect(result.status).toBe('succeeded');

    const latestReport = await reportRepository.getLatestRunReport(agentId);
    expect(latestReport).not.toBeNull();
    expect(latestReport?.signals[0]).toMatchObject({ symbol: 'ACME', side: 'long' });
    expect(latestReport?.needsHumanReview).toBe(false);
  });
});
