import {
  getPromptCharacter,
  getPromptCharactersForPersona,
  getPromptPersona
} from '../data/prompt-personas';

type AgentIdentity = {
  characterType?: string;
  promptConfig?: { personality_id?: string; personality_label?: string };
};

function humanizeCharacterType(characterType: string): string {
  return characterType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function getAgentDisplayLabel(agent: AgentIdentity): string {
  const characterType = agent.characterType ?? 'summarizer';
  const character = getPromptPersona(characterType)?.name ?? humanizeCharacterType(characterType);
  const personalityId = agent.promptConfig?.personality_id;
  const personality =
    (personalityId ? getPromptCharacter(characterType, personalityId)?.name : undefined) ??
    agent.promptConfig?.personality_label?.trim() ??
    getPromptCharactersForPersona(characterType)[0]?.name ??
    'Default Personality';

  return `${personality} · ${character}`;
}
