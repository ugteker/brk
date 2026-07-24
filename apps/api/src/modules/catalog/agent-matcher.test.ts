import { describe, expect, it } from 'vitest';
import { rankAgentMatches } from './agent-matcher';

function fixture(overrides: Partial<Parameters<typeof rankAgentMatches>[0]['agents'][number]> & { agentVersionId: string }) {
  return {
    publicationId: null,
    agentVersionId: overrides.agentVersionId,
    ownership: 'curated' as const,
    name: overrides.agentVersionId,
    purpose: `${overrides.agentVersionId} purpose`,
    characterType: 'summarizer' as const,
    iconAssetKey: null,
    sourceTypes: [],
    topics: [],
    language: 'en',
    editorialRank: 0,
    ...overrides
  };
}

describe('rankAgentMatches', () => {
  it('ranks topic, language, ownership, then editorial rank', () => {
    const matches = rankAgentMatches({
      source: { type: 'podcast_feeds', topics: ['business'], language: 'en' },
      agents: [
        fixture({
          agentVersionId: 'curated-topic',
          topics: ['business'],
          sourceTypes: ['podcast_feeds'],
          language: 'en',
          ownership: 'curated',
          editorialRank: 5
        }),
        fixture({
          agentVersionId: 'owned-topic',
          topics: ['business'],
          sourceTypes: ['podcast_feeds'],
          language: 'en',
          ownership: 'owned',
          editorialRank: 1
        }),
        fixture({
          agentVersionId: 'type-only',
          topics: ['science'],
          sourceTypes: ['podcast_feeds'],
          language: 'en',
          ownership: 'curated',
          editorialRank: 99
        })
      ]
    });

    expect(matches.map((match) => match.agentVersionId)).toEqual(['owned-topic', 'curated-topic', 'type-only']);
    expect(matches[0].reasons).toEqual([
      { code: 'topic', value: 'business' },
      { code: 'language', value: 'en' }
    ]);
    expect(matches[0]).toMatchObject({
      characterType: 'summarizer',
      sourceTypes: ['podcast_feeds'],
      topics: ['business'],
      language: 'en'
    });
  });

  it('falls back to language and editorial rank when topic metadata is missing', () => {
    const matches = rankAgentMatches({
      source: { type: 'podcast_feeds', topics: [], language: 'en' },
      agents: [
        fixture({ agentVersionId: 'type-and-language', sourceTypes: ['podcast_feeds'], language: 'en', editorialRank: 1 }),
        fixture({ agentVersionId: 'language-only', sourceTypes: ['web_urls'], language: 'en', editorialRank: 99 }),
        fixture({ agentVersionId: 'editorial-only', sourceTypes: ['web_urls'], language: 'de', editorialRank: 100 })
      ]
    });

    expect(matches.map((match) => match.agentVersionId)).toEqual(['type-and-language', 'language-only', 'editorial-only']);
    expect(matches[0].reasons).toEqual([
      { code: 'language', value: 'en' }
    ]);
  });

  it('falls back to language before editorial rank when source type does not match', () => {
    const matches = rankAgentMatches({
      source: { type: 'youtube_videos', topics: [], language: 'de' },
      agents: [
        fixture({ agentVersionId: 'language-match', sourceTypes: ['web_urls'], language: 'de', editorialRank: 1 }),
        fixture({ agentVersionId: 'editorial-only', sourceTypes: ['web_urls'], language: 'en', editorialRank: 999 })
      ]
    });

    expect(matches.map((match) => match.agentVersionId)).toEqual(['language-match', 'editorial-only']);
    expect(matches[0].reasons).toEqual([{ code: 'language', value: 'de' }]);
  });

  it('breaks exact ties deterministically by agent version id', () => {
    const matches = rankAgentMatches({
      source: { type: 'web_urls', topics: ['markets'], language: 'en' },
      agents: [
        fixture({
          agentVersionId: 'zebra',
          topics: ['markets'],
          sourceTypes: ['web_urls'],
          language: 'en',
          editorialRank: 7
        }),
        fixture({
          agentVersionId: 'alpha',
          topics: ['markets'],
          sourceTypes: ['web_urls'],
          language: 'en',
          editorialRank: 7
        })
      ]
    });

    expect(matches.map((match) => match.agentVersionId)).toEqual(['alpha', 'zebra']);
  });

  it('uses editorial rank as the final tie-breaker before agent version id', () => {
    const matches = rankAgentMatches({
      source: { type: 'web_urls', topics: ['markets'], language: 'en' },
      agents: [
        fixture({
          agentVersionId: 'later-rank',
          topics: ['markets'],
          sourceTypes: ['web_urls'],
          language: 'en',
          editorialRank: 9
        }),
        fixture({
          agentVersionId: 'higher-priority-rank',
          topics: ['markets'],
          sourceTypes: ['web_urls'],
          language: 'en',
          editorialRank: 1
        })
      ]
    });

    expect(matches.map((match) => match.agentVersionId)).toEqual(['higher-priority-rank', 'later-rank']);
  });
});

