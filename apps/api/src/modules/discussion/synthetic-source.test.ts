import { describe, it, expect, vi } from 'vitest';
import { SyntheticSourceService } from './synthetic-source';

function makeDb(sourceExists = false) {
  const sourceRow = sourceExists ? { id: 's-existing' } : null;
  return {
    source: {
      findFirst: vi.fn().mockResolvedValue(sourceRow),
      create: vi.fn().mockResolvedValue({ id: 's-new' })
    },
    sourceItem: {
      create: vi.fn().mockResolvedValue({ id: 'si1' })
    },
    discussion: {
      update: vi.fn().mockResolvedValue({})
    },
    discussionRun: {
      update: vi.fn().mockResolvedValue({})
    }
  };
}

const baseDiscussion = {
  id: 'd1', ownerUserId: 'u1', name: 'Bull vs Bear', description: '',
  format: 'free_form' as const, formatConfig: {}, scheduleJson: null,
  syntheticSourceId: null, createdAt: new Date(), updatedAt: new Date(), participants: []
};

describe('SyntheticSourceService', () => {
  it('creates source and episode on first run', async () => {
    const db = makeDb(false);
    const svc = new SyntheticSourceService(db as any);
    await svc.ensureSyntheticSource(baseDiscussion, 'r1', 'Agent A: hello\nAgent B: world', ['Agent A', 'Agent B']);
    expect(db.source.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'synthetic_discussion' })
    }));
    // Config should embed participants and libraryCard title for the library card
    const createdConfigJson = db.source.create.mock.calls[0][0].data.configJson as string;
    const cfg = JSON.parse(createdConfigJson);
    expect(cfg.participants).toEqual(['Agent A', 'Agent B']);
    expect(cfg.libraryCard?.title).toBe('Bull vs Bear');
    expect(db.sourceItem.create).toHaveBeenCalled();
    expect(db.discussionRun.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { syntheticSourceItemId: 'si1' } });
  });

  it('reuses existing source if already exists', async () => {
    const db = makeDb(true);
    const svc = new SyntheticSourceService(db as any);
    await svc.ensureSyntheticSource(baseDiscussion, 'r1', 'hello', ['Agent A']);
    expect(db.source.create).not.toHaveBeenCalled();
    expect(db.sourceItem.create).toHaveBeenCalled();
  });

  it('skips source lookup if syntheticSourceId already set', async () => {
    const db = makeDb(false);
    const svc = new SyntheticSourceService(db as any);
    const disc = { ...baseDiscussion, syntheticSourceId: 'already-s1' };
    await svc.ensureSyntheticSource(disc, 'r2', 'transcript', ['Agent A']);
    expect(db.source.findFirst).not.toHaveBeenCalled();
    expect(db.source.create).not.toHaveBeenCalled();
    expect(db.sourceItem.create).toHaveBeenCalled();
  });
});
