import {
  getPromptCharacter,
  getPromptCharactersForPersona,
  getPromptPersona
} from '../data/prompt-personas';

type AgentIdentity = {
  name?: string;
  characterType?: string;
  promptConfig?: { personality_id?: string; personality_label?: string };
};

function humanizeCharacterType(characterType: string): string {
  return characterType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

/** The agent's own chosen title (e.g. "Lernstrategie-Coach") is the label everywhere it's
 * available - the "personality · character" synthesis below only covers the rare case of an
 * agent record with no name at all (shouldn't normally happen; name is required on creation). */
export function getAgentDisplayLabel(agent: AgentIdentity): string {
  const customName = agent.name?.trim();
  if (customName) return customName;

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
