import type { PrismaClient } from '@prisma/client';
import type { SiteProfile, SiteType, SourceCrawlConfigState } from '../analysis/types';

type ConfigDb = Pick<PrismaClient, 'agentSourceCrawlConfig'>;

const REINSPECTION_CAP_PER_DAY = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ConfigRow {
  agentId: string;
  sourceValue: string;
  siteType: string;
  configJson: string;
  inspectedAt: Date;
  inspectionModel: string | null;
  confidence: number | null;
  lastReinspectionAt: Date | null;
  reinspectionCount24h: number;
}

function toState(row: ConfigRow): SourceCrawlConfigState {
  let config: SiteProfile | Record<string, never> = {};
  try {
    config = JSON.parse(row.configJson) as SiteProfile | Record<string, never>;
  } catch {
    config = {};
  }

  return {
    agentId: row.agentId,
    sourceValue: row.sourceValue,
    siteType: row.siteType as SiteType,
    config,
    inspectedAt: row.inspectedAt.toISOString(),
    inspectionModel: row.inspectionModel,
    confidence: row.confidence,
    lastReinspectionAt: row.lastReinspectionAt ? row.lastReinspectionAt.toISOString() : null,
    reinspectionCount24h: row.reinspectionCount24h
  };
}

export interface SourceCrawlConfigRepositoryLike {
  getConfig(agentId: string, sourceValue: string): Promise<SourceCrawlConfigState | null>;
  saveConfig(state: SourceCrawlConfigState): Promise<void>;
}

export class SourceCrawlConfigRepository implements SourceCrawlConfigRepositoryLike {
  constructor(private readonly db: ConfigDb) {}

  async getConfig(agentId: string, sourceValue: string): Promise<SourceCrawlConfigState | null> {
    const row = await this.db.agentSourceCrawlConfig.findUnique({
      where: { agentId_sourceValue: { agentId, sourceValue } }
    });
    return row ? toState(row) : null;
  }

  async saveConfig(state: SourceCrawlConfigState): Promise<void> {
    const data = {
      siteType: state.siteType,
      configJson: JSON.stringify(state.config),
      inspectedAt: new Date(state.inspectedAt),
      inspectionModel: state.inspectionModel,
      confidence: state.confidence,
      lastReinspectionAt: state.lastReinspectionAt ? new Date(state.lastReinspectionAt) : null,
      reinspectionCount24h: state.reinspectionCount24h
    };

    await this.db.agentSourceCrawlConfig.upsert({
      where: { agentId_sourceValue: { agentId: state.agentId, sourceValue: state.sourceValue } },
      create: { agentId: state.agentId, sourceValue: state.sourceValue, ...data },
      update: data
    });
  }
}

export class InMemorySourceCrawlConfigRepository implements SourceCrawlConfigRepositoryLike {
  private readonly configs = new Map<string, SourceCrawlConfigState>();

  private key(agentId: string, sourceValue: string): string {
    return `${agentId}::${sourceValue}`;
  }

  async getConfig(agentId: string, sourceValue: string): Promise<SourceCrawlConfigState | null> {
    return this.configs.get(this.key(agentId, sourceValue)) ?? null;
  }

  async saveConfig(state: SourceCrawlConfigState): Promise<void> {
    this.configs.set(this.key(state.agentId, state.sourceValue), state);
  }
}

/**
 * Determines whether a reinspection attempt is currently allowed for a source, enforcing the
 * confirmed cap of 1 reinspection attempt per source per rolling 24h window. A source that has
 * never been reinspected (or whose last reinspection fell outside the current window) is always
 * allowed.
 */
export function canReinspect(current: SourceCrawlConfigState | null, now: Date = new Date()): boolean {
  if (!current?.lastReinspectionAt) return true;
  const withinWindow = now.getTime() - new Date(current.lastReinspectionAt).getTime() < DAY_MS;
  if (!withinWindow) return true;
  return current.reinspectionCount24h < REINSPECTION_CAP_PER_DAY;
}

/**
 * Computes the next reinspection bookkeeping fields after performing a reinspection attempt,
 * resetting the rolling 24h counter once the prior window has elapsed.
 */
export function nextReinspectionState(
  current: SourceCrawlConfigState | null,
  now: Date = new Date()
): { lastReinspectionAt: string; reinspectionCount24h: number } {
  const withinWindow = current?.lastReinspectionAt
    ? now.getTime() - new Date(current.lastReinspectionAt).getTime() < DAY_MS
    : false;

  return {
    lastReinspectionAt: now.toISOString(),
    reinspectionCount24h: withinWindow ? current!.reinspectionCount24h + 1 : 1
  };
}
