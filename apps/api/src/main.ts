import 'dotenv/config';
import { buildServer } from './server';
import { AgentRepository } from './modules/agents/repository';
import { RunQueueService } from './modules/runs/run-queue.service';
import { PrismaRunStore } from './modules/runs/prisma-run-store';
import type { ForcedEpisodeSelection } from './modules/analysis/agent-runner';
import { startSchedulerLoop } from './modules/schedules/scheduler-loop';
import { ManualRunTrigger } from './modules/runs/manual-run-trigger';
import { ensureSqliteSchemaCompatibility, prisma } from './lib/db';
import { PromptRepository } from './modules/prompts/repository';
import { ArtifactRepository } from './modules/artifacts/repository';
import { ReportRepository } from './modules/reports/repository';
import { RunsRepository } from './modules/runs/repository';
import { ClaudeClient } from './modules/analysis/claude-client';
import { WebUrlAdapter } from './modules/analysis/source-adapters/web-url-adapter';
import { PodcastFeedAdapter } from './modules/analysis/source-adapters/podcast-feed-adapter';
import { YouTubeAdapter } from './modules/analysis/source-adapters/youtube-adapter';
import { defaultHttpGet } from './modules/analysis/source-adapters/web-url-adapter';
import { defaultHttpPostJson, youtubeHttpGet } from './modules/analysis/source-adapters/youtube-adapter';
import { SiteInspectorClient } from './modules/analysis/site-inspector-client';
import { SourceCursorRepository } from './modules/crawler/source-cursor-repository';
import { SourceCrawlConfigRepository } from './modules/crawler/crawl-config-repository';
import { AgentRunner } from './modules/analysis/agent-runner';
import { probeSource } from './modules/analysis/source-adapters/smart-crawler';
import { probeYouTubeSource } from './modules/analysis/source-adapters/youtube-adapter';
import { UserRepository } from './modules/auth/repository';
import { GoogleOAuthHttpClient } from './modules/auth/google-oauth';
import { hashPassword } from './modules/auth/password';
import { SmtpMailer } from './modules/auth/mailer';
import { config } from './config';
import { AccessRepository } from './modules/access/repository';
import { DomainAccessResolver } from './modules/access/permissions';
import { SourceRepository } from './modules/source/repository';
import { PlaybookRepository } from './modules/playbook/repository';
import { PrismaDigestStore, startDigestLoop } from './modules/playbook/digest';
import { ReportChatRepository, ReportChatService } from './modules/reports/chat';
import { logger } from './lib/logger';

async function bootstrapAdminAccount(userRepository: UserRepository) {
  const { email, password } = config.auth.bootstrapAdmin;
  if (!email && !password) return;
  if (!email || !password) {
    logger.warn('[auth] ADMIN_EMAIL/ADMIN_PASSWORD are only partially set (both are required to bootstrap an admin account) — skipping bootstrap');
    return;
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    // The account may have been created before email-confirmation/locking existed, or before this
    // bootstrap fix landed - make sure the configured admin is always usable on every boot, not
    // just at first creation, otherwise the admin can get silently locked out of their own app.
    if (existing.role !== 'admin') {
      await userRepository.setRole(existing.id, 'admin');
    }
    if (!existing.emailVerified) {
      await userRepository.setEmailVerified(existing.id, true);
    }
    if (existing.locked) {
      await userRepository.setLocked(existing.id, false);
    }
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await userRepository.createWithPassword(email, passwordHash, 'Admin', 'admin');
  // The bootstrap admin is configured directly via trusted backend env vars, bypassing the
  // normal signup/email-confirmation flow entirely - so it must be marked verified up front,
  // otherwise the new email-verification login gate would lock the admin out of their own app.
  await userRepository.setEmailVerified(admin.id, true);
  logger.info(`[auth] Bootstrapped admin account for ${email} from backend config`);
}

async function start() {
  await ensureSqliteSchemaCompatibility();

  const agentRepository = new AgentRepository(prisma);
  const promptRepository = new PromptRepository(prisma);
  const artifactRepository = new ArtifactRepository(prisma);
  const reportRepository = new ReportRepository(prisma);
  const runsRepository = new RunsRepository(prisma);
  const claudeClient = new ClaudeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userRepository = new UserRepository(prisma);
  const sourceRepository = new SourceRepository(prisma);
  const playbookRepository = new PlaybookRepository(prisma);
  const accessResolver = new DomainAccessResolver(new AccessRepository(prisma));
  const cursorRepository = new SourceCursorRepository(prisma);
  const crawlConfigRepository = new SourceCrawlConfigRepository(prisma);
  const siteInspector = new SiteInspectorClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  const mailer = new SmtpMailer();
  const smartCrawlerDeps = {
    httpGet: defaultHttpGet,
    cursorRepository,
    crawlConfigRepository,
    siteInspector
  };

  await bootstrapAdminAccount(userRepository);

  const runStore = new PrismaRunStore(prisma);
  const queue = new RunQueueService(runStore);

  const agentRunner = new AgentRunner({
    agentRepository: agentRepository,
    promptRepository,
    artifactRepository,
    reportRepository,
    claudeClient,
    cursorRepository,
    mailer,
    onPhaseChange: (agentRunId, phase) => queue.setPhase(agentRunId, phase),
    sourceAdapters: {
      web_urls: new WebUrlAdapter(smartCrawlerDeps),
      podcast_feeds: new PodcastFeedAdapter(smartCrawlerDeps),
      youtube_videos: new YouTubeAdapter({ httpGet: youtubeHttpGet, httpPostJson: defaultHttpPostJson, cursorRepository })
    }
  });

  const manualRunTrigger = new ManualRunTrigger(queue, agentRunner);

  const reportChatService = new ReportChatService({
    reportRepository,
    artifactRepository,
    promptRepository,
    agentRepository,
    chatRepository: new ReportChatRepository(prisma),
    claudeClient
  });

  const app = await buildServer({
    agentRepository,
    agents: { promptRepository, reportRepository, agentRepository, mailer, reportChatService },
    accessResolver,
    runs: { runsRepository },
    auth: { userRepository, googleOAuthClient: new GoogleOAuthHttpClient(), mailer },
    source: {
      sourceRepository,
      accessResolver,
      sourceProbe: {
        probeSource: (source, previewLimit) =>
          source.type === 'youtube_videos'
            ? probeYouTubeSource({ httpGet: youtubeHttpGet, httpPostJson: defaultHttpPostJson }, source, previewLimit)
            : probeSource({ httpGet: defaultHttpGet, siteInspector }, source, previewLimit)
      }
    },
    playbook: {
      playbookRepository,
      accessResolver,
      runTrigger: {
        triggerRun: async (playbookId: string, options?: { forcedEpisode?: { sourceType: string; sourceValue: string; itemLink: string } }) => {
          const playbook = await playbookRepository.getPlaybook(playbookId);
          if (!playbook) {
            return { status: 'failed', errorCode: 'not_found' };
          }
          return manualRunTrigger.triggerRun(playbook.agentId, {
            playbookRecipients: playbook.recipients,
            playbookLanguage: playbook.language,
            playbookNotificationsEnabled: playbook.notificationsEnabled,
            playbookDigestFrequency: playbook.digestFrequency,
            forcedEpisode: options?.forcedEpisode as ForcedEpisodeSelection | undefined
          });
        }
      }
    },
    sourceProbe: {
      probeSource: (source, previewLimit) =>
        source.type === 'youtube_videos'
          ? probeYouTubeSource({ httpGet: youtubeHttpGet, httpPostJson: defaultHttpPostJson }, source, previewLimit)
          : probeSource({ httpGet: defaultHttpGet, siteInspector }, source, previewLimit)
    },
    runTrigger: manualRunTrigger
  });

  startSchedulerLoop({ intervalMs: 60_000, queue, runner: agentRunner });
  startDigestLoop({ store: new PrismaDigestStore(prisma), mailer });
  await app.listen({ port: 3000, host: '0.0.0.0' });
}

start();
