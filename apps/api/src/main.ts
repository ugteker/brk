import 'dotenv/config';
import { buildServer } from './server';
import { AgentRepository } from './modules/agents/repository';
import { RunQueueService } from './modules/runs/run-queue.service';
import { PrismaRunStore } from './modules/runs/prisma-run-store';
import type { ForcedEpisodeSelection } from './modules/analysis/agent-runner';
import { startSchedulerLoop } from './modules/schedules/scheduler-loop';
import { ManualRunTrigger } from './modules/runs/manual-run-trigger';
import { ensureSqliteSchemaCompatibility, prisma } from './lib/db';
import cluster from 'node:cluster';
import { applySqlitePragmas } from './lib/sqlite-pragmas';
import { parseWebConcurrency, planClusterProcesses, resolveRole, rolePlan, createCrashLoopGuard, type Role } from './runtime/roles';
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
import { config, isTtsConfigured, isGoogleTtsConfigured } from './config';
import { AccessRepository } from './modules/access/repository';
import { DomainAccessResolver } from './modules/access/permissions';
import { SourceRepository } from './modules/source/repository';
import { createSourceSearch } from './modules/source/search';
import { PlaybookRepository } from './modules/playbook/repository';
import { PrismaDigestStore, startDigestLoop } from './modules/playbook/digest';
import { ReportChatRepository, ReportChatService } from './modules/reports/chat';
import { WatchlistRepository } from './modules/watchlist/repository';
import { WatchlistNotifier } from './modules/watchlist/notifier';
import { PrismaUsageStore, UsageService } from './modules/usage/budget';
import { DiscussionRepository } from './modules/discussion/repository';
import { DiscussionOrchestrator } from './modules/discussion/orchestrator';
import { SyntheticSourceService } from './modules/discussion/synthetic-source';
import { OpenAITtsClient } from './modules/discussion/tts-client';
import { GoogleTtsClient } from './modules/discussion/google-tts-client';
import { FileTtsStorage } from './modules/discussion/tts-storage';
import OpenAI from 'openai';
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

async function start(role: Role) {
  const plan = rolePlan(role);
  await ensureSqliteSchemaCompatibility();
  await applySqlitePragmas(prisma);

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
  const watchlistRepository = new WatchlistRepository(prisma);
  const watchlistNotifier = new WatchlistNotifier({ watchlistRepository, userRepository, mailer });
  const usageService = new UsageService(new PrismaUsageStore(prisma));
  const smartCrawlerDeps = {
    httpGet: defaultHttpGet,
    cursorRepository,
    crawlConfigRepository,
    siteInspector
  };

  const discussionRepository = new DiscussionRepository(prisma);
  const syntheticSourceService = new SyntheticSourceService(prisma);
  const discussionOrchestrator = new DiscussionOrchestrator({
    discussionRepository,
    agentRepository,
    promptRepository,
    reportRepository,
    artifactRepository,
    claudeClient,
    syntheticSource: syntheticSourceService,
    latestReportLimit: config.discussion.latestReportLimit
  });

  if (plan.startSchedulers) {
    await bootstrapAdminAccount(userRepository);
  }

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
    watchlistNotifier,
    budgetGuard: usageService,
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
      reportRepository,
      sourceSearch: createSourceSearch({
        httpGet: defaultHttpGet,
        youtubeHttpGet,
        youtubeApiKey: process.env.YOUTUBE_API_KEY
      }),
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
    runTrigger: manualRunTrigger,
    watchlist: { watchlistRepository },
    usage: { usageService },
    discussion: {
      discussionRepository,
      runTrigger: {
        triggerDiscussionRun: (discussionId: string, runId: string) =>
          discussionOrchestrator.run(discussionId, runId)
      },
      reportRepository,
      latestReportLimit: config.discussion.latestReportLimit,
      artifactRepository,
      audioDir: config.tts.audioDir,
      // TTS is optional: without a GOOGLE_TTS_API_KEY or OPENAI_API_KEY the render endpoint
      // answers 501 and the UI tells the user that audio rendering isn't configured.
      // Google is preferred when both are set (works where corporate policy blocks OpenAI).
      ...(isTtsConfigured()
        ? {
            ttsClient: isGoogleTtsConfigured()
              ? new GoogleTtsClient({
                  apiKey: config.tts.googleApiKey || undefined,
                  serviceAccount: config.tts.googleCredentials || undefined
                })
              : new OpenAITtsClient(new OpenAI({ apiKey: config.tts.openaiApiKey })),
            ttsStorage: new FileTtsStorage(config.tts.audioDir)
          }
        : {})
    },
    db: prisma
  });

  if (plan.startSchedulers) {
    startSchedulerLoop({ intervalMs: 60_000, queue, runner: agentRunner });
    startDigestLoop({ store: new PrismaDigestStore(prisma), mailer });

    // Discussion scheduler: check every 60s for scheduled discussions due to run
    setInterval(async () => {
      try {
        const scheduled = await discussionRepository.listScheduledDiscussions();
        const now = Date.now();
        for (const d of scheduled) {
          if (!d.scheduleJson) continue;
          let schedule: { mode: string; intervalMinutes?: number; dailyTime?: string; timezone?: string; lastRunAt?: number };
          try { schedule = JSON.parse(d.scheduleJson); } catch { continue; }
          const lastRun = schedule.lastRunAt ?? 0;
          let dueMs = Infinity;
          if (schedule.mode === 'interval' && schedule.intervalMinutes) {
            dueMs = lastRun + schedule.intervalMinutes * 60_000;
          } else if (schedule.mode === 'daily' && schedule.dailyTime) {
            const [hh, mm] = schedule.dailyTime.split(':').map(Number);
            const nextRun = new Date();
            nextRun.setHours(hh, mm, 0, 0);
            if (nextRun.getTime() <= lastRun) nextRun.setDate(nextRun.getDate() + 1);
            dueMs = nextRun.getTime();
          }
          if (now >= dueMs) {
            const run = await discussionRepository.createRun(d.id, 'scheduled');
            await discussionOrchestrator.run(d.id, run.id);
            const updated = { ...JSON.parse(d.scheduleJson), lastRunAt: now };
            await discussionRepository.updateDiscussion(d.id, { scheduleJson: JSON.stringify(updated) });
          }
        }
      } catch { /* non-fatal */ }
    }, 60_000);
  }

  if (plan.startHttp) {
    await app.listen({ port: 3000, host: '0.0.0.0' });
  } else {
    logger.info(`[runtime] role=${role}: scheduler-only process (no HTTP listener)`);
  }
}

function bootstrap() {
  const concurrency = parseWebConcurrency(process.env.WEB_CONCURRENCY);
  const children = planClusterProcesses(concurrency);

  if (children.length > 0 && cluster.isPrimary) {
    logger.info(`[runtime] cluster primary: forking ${concurrency} web process(es) + 1 worker process`);
    const rolesByWorkerId = new Map<number, Role>();
    const guard = createCrashLoopGuard();
    for (const role of children) {
      const child = cluster.fork({ ...process.env, ROLE: role });
      rolesByWorkerId.set(child.id, role);
    }
    cluster.on('exit', (worker, code, signal) => {
      const role = rolesByWorkerId.get(worker.id) ?? 'web';
      rolesByWorkerId.delete(worker.id);
      logger.warn(`[runtime] ${role} process ${worker.process.pid} exited (code=${code}, signal=${signal}) — respawning`);
      if (!guard.recordExit(Date.now())) {
        logger.error('[runtime] children are crash-looping — exiting so the container restart policy takes over');
        process.exit(1);
      }
      const replacement = cluster.fork({ ...process.env, ROLE: role });
      rolesByWorkerId.set(replacement.id, role);
    });
    return;
  }

  start(resolveRole(process.env.ROLE)).catch((err) => {
    logger.error(`[runtime] fatal startup error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exit(1);
  });
}

bootstrap();
