import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cloneMarketplaceAgent,
  cloneMarketplacePlaybook,
  cloneMarketplaceSource,
  listMarketplaceAgents,
  listMarketplacePlaybooks,
  listMarketplaceSources
} from './marketplace';
import {
  createSource,
  deleteSource,
  getSource,
  listSources,
  probeSource,
  publishSource,
  shareSource,
  updateSource
} from './sources';
import {
  createPlaybook,
  deletePlaybook,
  getPlaybook,
  listPlaybooks,
  publishPlaybook,
  runPlaybookNow,
  sharePlaybook,
  updatePlaybook
} from './playbooks';
import { grantAgentAccess, listAgentAccessGrants, revokeAgentAccess } from './access';
import { probeSource as probeSourceFromAgents, publishAgent } from './agents';

const fetchMock = vi.fn();

describe('domain API clients', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('creates a source via /api/sources', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'source-1' })
    });

    await createSource({ type: 'web_urls', value: 'https://example.com' });

    expect(fetchMock).toHaveBeenCalledWith('/api/sources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'web_urls', value: 'https://example.com' })
    });
  });

  it('surfaces backend source errors from message field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'A source type and non-empty value are required' })
    });

    await expect(createSource({ type: 'web_urls', value: '' })).rejects.toThrow('A source type and non-empty value are required');
  });

  it('runs source probe from sources module and agents re-export', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ reachable: true, kind: 'feed' })
    });

    await probeSource({ type: 'podcast_feeds', value: 'https://example.com/feed.xml', maxItems: 5 });
    await probeSourceFromAgents({ type: 'podcast_feeds', value: 'https://example.com/feed.xml', maxItems: 5 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sources/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'podcast_feeds', value: 'https://example.com/feed.xml', maxItems: 5 })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sources/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'podcast_feeds', value: 'https://example.com/feed.xml', maxItems: 5 })
    });
  });

  it('falls back to legacy probe endpoint when /api/sources/probe returns 404', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Route POST:/api/sources/probe not found' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reachable: true, kind: 'feed' })
      });

    await probeSource({ type: 'youtube_videos', value: 'https://www.youtube.com/playlist?list=PL6P5rY8mrhqrhVgc_pkSOlRLpuGW3CpJ3' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sources/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'youtube_videos',
        value: 'https://www.youtube.com/playlist?list=PL6P5rY8mrhqrhVgc_pkSOlRLpuGW3CpJ3'
      })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/agents/sources/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'youtube_videos',
        value: 'https://www.youtube.com/playlist?list=PL6P5rY8mrhqrhVgc_pkSOlRLpuGW3CpJ3'
      })
    });
  });

  it('calls all source endpoints with expected paths', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'source-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'source-1' }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicationId: 'pub-1' }) });

    await listSources();
    await getSource('source-1');
    await updateSource('source-1', { value: 'https://new.example.com' });
    await shareSource('source-1', { granteeUserId: 'user-2', permission: 'read' });
    await deleteSource('source-1');
    await publishSource('source-1', { title: 'Public source' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sources');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sources/source-1');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/sources/source-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'https://new.example.com' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/sources/source-1/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ granteeUserId: 'user-2', permission: 'read' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/sources/source-1', { method: 'DELETE' });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/sources/source-1/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Public source' })
    });
  });

  it('calls all playbook endpoints with expected paths', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'playbook-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'playbook-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'playbook-1' }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'queued' }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ publicationId: 'pub-1' }) });

    await createPlaybook({ agentId: 'agent-1', name: 'PB', sourceIds: ['source-1'] });
    await listPlaybooks();
    await getPlaybook('playbook-1');
    await updatePlaybook('playbook-1', { name: 'PB 2' });
    await sharePlaybook('playbook-1', { granteeUserId: 'user-2', permission: 'read' });
    await runPlaybookNow('playbook-1');
    await deletePlaybook('playbook-1');
    await publishPlaybook('playbook-1', { title: 'Public playbook' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/playbooks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'agent-1', name: 'PB', sourceIds: ['source-1'] })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/playbooks');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/playbooks/playbook-1');
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/playbooks/playbook-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'PB 2' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/playbooks/playbook-1/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ granteeUserId: 'user-2', permission: 'read' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/playbooks/playbook-1/run', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/playbooks/playbook-1', { method: 'DELETE' });
    expect(fetchMock).toHaveBeenNthCalledWith(8, '/api/playbooks/playbook-1/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Public playbook' })
    });
  });

  it('maps 503 manual run error for playbooks', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(runPlaybookNow('playbook-1')).rejects.toThrow('Manual runs are not available right now');
  });

  it('calls marketplace endpoints for sources and playbooks', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ source: { id: 'source-1' }, cloned: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ playbook: { id: 'playbook-1' }, cloned: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agent: { id: 'agent-1' }, cloned: true }) });

    await listMarketplaceSources();
    await cloneMarketplaceSource('pub-source-1');
    await listMarketplacePlaybooks();
    await cloneMarketplacePlaybook('pub-playbook-1');
    await listMarketplaceAgents();
    await cloneMarketplaceAgent('pub-agent-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sources/marketplace');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sources/marketplace/pub-source-1/clone', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/playbooks/marketplace');
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/playbooks/marketplace/pub-playbook-1/clone', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/agents/marketplace');
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/agents/marketplace/pub-agent-1/clone', { method: 'POST' });
  });

  it('publishes an agent via /api/agents/:id/publish', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ publicationId: 'pub-1' }) });

    await publishAgent('agent-1', { title: 'Agent release', summary: 'Market scanner', visibility: 'public' });

    expect(fetchMock).toHaveBeenCalledWith('/api/agents/agent-1/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Agent release', summary: 'Market scanner', visibility: 'public' })
    });
  });

  it('calls access grant endpoints for agents', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await listAgentAccessGrants('agent-1');
    await grantAgentAccess('agent-1', { granteeUserId: 'user-2', permission: 'edit' });
    await revokeAgentAccess('agent-1', 'grant-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/agents/agent-1/shares');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/agents/agent-1/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ granteeUserId: 'user-2', permission: 'edit' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/agents/agent-1/shares/grant-1', { method: 'DELETE' });
  });
});
