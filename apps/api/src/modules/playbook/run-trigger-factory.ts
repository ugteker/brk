import type { AgentRunOptions, ForcedEpisodeSelection } from '../analysis/agent-runner';
import type { ManualRunTrigger } from '../runs/manual-run-trigger';
import type { PlaybookRepository } from './repository';

type ManualRunTriggerLike = Pick<ManualRunTrigger, 'triggerRun'>;
type PlaybookRepositoryLike = Pick<PlaybookRepository, 'getPlaybook'>;

export function createPlaybookRunTrigger(manualRunTrigger: ManualRunTriggerLike, playbookRepository: PlaybookRepositoryLike) {
  return {
    triggerRun: async (playbookId: string, options?: { forcedEpisode?: ForcedEpisodeSelection }) => {
      const playbook = await playbookRepository.getPlaybook(playbookId);
      if (!playbook) {
        return { status: 'failed', errorCode: 'not_found' };
      }
      const runOptions: AgentRunOptions = {
        playbookId: playbook.id,
        agentVersionId: playbook.agentVersionId ?? undefined,
        playbookRecipients: playbook.recipients,
        playbookLanguage: playbook.language,
        playbookNotificationsEnabled: playbook.notificationsEnabled,
        playbookDigestFrequency: playbook.digestFrequency,
        forcedEpisode: options?.forcedEpisode
      };
      return manualRunTrigger.triggerRun(playbook.agentId, runOptions);
    }
  };
}
