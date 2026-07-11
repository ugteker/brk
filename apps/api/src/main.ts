import 'dotenv/config';
import { buildServer } from './server';
import { AgentRepository } from './modules/agents/repository';
import { RunQueueService } from './modules/runs/run-queue.service';
import { PrismaRunStore } from './modules/runs/prisma-run-store';
import { startSchedulerLoop } from './modules/schedules/scheduler-loop';
import { prisma } from './lib/db';
import { PromptRepository } from './modules/prompts/repository';
import { ArtifactRepository } from './modules/artifacts/repository';
import { ReportRepository } from './modules/reports/repository';
import { ClaudeClient } from './modules/analysis/claude-client';
import { WebUrlAdapter } from './modules/analysis/source-adapters/web-url-adapter';
import { PodcastFeedAdapter } from './modules/analysis/source-adapters/podcast-feed-adapter';
import { AgentRunner } from './modules/analysis/agent-runner';
import { UserRepository } from './modules/auth/repository';
import { GoogleOAuthHttpClient } from './modules/auth/google-oauth';
import { hashPassword } from './modules/auth/password';
import { config } from './config';

async function bootstrapAdminAccount(userRepository: UserRepository) {
  const { email, password } = config.auth.bootstrapAdmin;
  if (!email && !password) return;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] ADMIN_EMAIL/ADMIN_PASSWORD are only partially set (both are required to bootstrap an admin account) — skipping bootstrap'
    );
    return;
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) return;

  const passwordHash = await hashPassword(password);
  await userRepository.createWithPassword(email, passwordHash, 'Admin');
  // eslint-disable-next-line no-console
  console.log(`[auth] Bootstrapped admin account for ${email} from backend config`);
}

async function start() {
  const agentRepository = new AgentRepository(prisma);
  const promptRepository = new PromptRepository(prisma);
  const artifactRepository = new ArtifactRepository(prisma);
  const reportRepository = new ReportRepository(prisma);
  const claudeClient = new ClaudeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userRepository = new UserRepository(prisma);

  await bootstrapAdminAccount(userRepository);

  const agentRunner = new AgentRunner({
    agentRepository: agentRepository,
    promptRepository,
    artifactRepository,
    reportRepository,
    claudeClient,
    sourceAdapters: {
      web_urls: new WebUrlAdapter(),
      podcast_feeds: new PodcastFeedAdapter((url) => fetch(url).then((r) => r.text()))
    }
  });

  const app = await buildServer({
    agentRepository,
    agents: { promptRepository, reportRepository },
    auth: { userRepository, googleOAuthClient: new GoogleOAuthHttpClient() }
  });

  const runStore = new PrismaRunStore(prisma);
  const queue = new RunQueueService(runStore);
  startSchedulerLoop({ intervalMs: 60_000, queue, runner: agentRunner });
  await app.listen({ port: 3000, host: '0.0.0.0' });
}

start();
