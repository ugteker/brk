import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Progress,
  Select,
  Steps,
  Switch,
  Tag,
  Typography,
  message
} from 'antd';
import {
  CheckCircleOutlined,
  MessageOutlined,
  UserOutlined
} from '@ant-design/icons';
import { createAgent, updateAgent, type AgentDetail } from '../api/agents';
import { saveAgentPrompt } from '../api/agents';
import {
  DEFAULT_PROMPT_CHARACTER_ID,
  DEFAULT_PROMPT_PERSONA_ID,
  PROMPT_PERSONAS,
  getPromptCharacter,
  getPromptCharactersForPersona,
  getPromptPersona
} from '../data/prompt-personas';

const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

interface AgentFormProps {
  onCancel?: () => void;
  onComplete?: () => void;
  agent?: AgentDetail;
  initialPrompt?: { model: string; systemPrompt: string } | null;
}

const STEPS = [
  { title: 'Choose character', icon: <UserOutlined /> },
  { title: 'Configure personality', icon: <MessageOutlined /> },
  { title: 'Save agent', icon: <CheckCircleOutlined /> }
] as const;

const DEFAULT_SYSTEM_PROMPT =
  getPromptCharacter(DEFAULT_PROMPT_PERSONA_ID, DEFAULT_PROMPT_CHARACTER_ID)?.systemPrompt ?? '';

export function AgentForm({ onCancel, onComplete, agent, initialPrompt }: AgentFormProps) {
  const isEditing = Boolean(agent);
  const [currentStep, setCurrentStep] = useState(0);
  const [maxVisitedStep, setMaxVisitedStep] = useState(0);
  const [name, setName] = useState(agent?.name ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [active, setActive] = useState(agent ? agent.status === 'active' : true);

  const [model, setModel] = useState(initialPrompt?.model ?? 'claude-sonnet-4-5');
  const [personaId, setPersonaId] = useState(DEFAULT_PROMPT_PERSONA_ID);
  const [characterId, setCharacterId] = useState(DEFAULT_PROMPT_CHARACTER_ID);
  const [systemPrompt, setSystemPrompt] = useState(initialPrompt?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>(
    agent?.preferences?.risk_level?.[0] ??
      getPromptCharacter(DEFAULT_PROMPT_PERSONA_ID, DEFAULT_PROMPT_CHARACTER_ID)?.riskLevel ??
      'medium'
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const selectedPersona = getPromptPersona(personaId);
  const availableCharacters = getPromptCharactersForPersona(personaId);
  const selectedCharacter =
    getPromptCharacter(personaId, characterId) ??
    availableCharacters[0] ??
    getPromptCharacter(DEFAULT_PROMPT_PERSONA_ID, DEFAULT_PROMPT_CHARACTER_ID);
  const selectedPersonaLabel = selectedPersona?.name ?? personaId;
  const selectedCharacterLabel = selectedCharacter?.name ?? characterId;
  const agentDisplayLabel = `${selectedCharacterLabel} · ${selectedPersonaLabel}`;

  // Initialize agent name to either the provided agent name or the derived display label
  useEffect(() => {
    if (!agent?.name && (!name || name.trim().length === 0)) {
      setName(agentDisplayLabel);
    }
  }, [agent, agentDisplayLabel]);

  function onPersonaChange(nextPersonaId: string) {
    const nextCharacters = getPromptCharactersForPersona(nextPersonaId);
    const firstCharacter = nextCharacters[0];
    setPersonaId(nextPersonaId as typeof personaId);
    if (firstCharacter) {
      setCharacterId(firstCharacter.id);
      setSystemPrompt(firstCharacter.systemPrompt);
      if (nextPersonaId === 'finance_expert') setRiskLevel(firstCharacter.riskLevel);
    }
  }

  function onCharacterChange(nextCharacterId: string) {
    setCharacterId(nextCharacterId);
    const character = getPromptCharacter(personaId, nextCharacterId);
    if (!character) return;
    setSystemPrompt(character.systemPrompt);
    if (personaId === 'finance_expert') setRiskLevel(character.riskLevel);
  }

  function validateStep(step: number): boolean {
    if (step === 0) {
      if (!personaId) {
        setValidationError('Choose a character to continue.');
        return false;
      }
      if (!characterId) {
        setValidationError('Choose a personality to continue.');
        return false;
      }
      if (!name || name.trim().length === 0) {
        setValidationError('Give this agent a short name to continue.');
        return false;
      }
    }

    if (step === 1) {
      if (personaId === 'finance_expert' && !riskLevel) {
        setValidationError('Risk level is required for finance personalities.');
        return false;
      }
    }

    setValidationError(null);
    return true;
  }

  function nextStep() {
    if (!validateStep(currentStep)) return;
    setCurrentStep((prev) => {
      const next = Math.min(STEPS.length - 1, prev + 1);
      setMaxVisitedStep((visited) => Math.max(visited, next));
      return next;
    });
  }

  function backStep() {
    setValidationError(null);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }

  function onStepChange(nextStepIndex: number) {
    if (nextStepIndex <= maxVisitedStep) {
      setValidationError(null);
      setCurrentStep(nextStepIndex);
      return;
    }

    if (validateStep(currentStep)) {
      setCurrentStep(nextStepIndex);
      setMaxVisitedStep((visited) => Math.max(visited, nextStepIndex));
    }
  }

  async function onSave() {
    try {
      setSaveState('saving');

      const payload = {
        name: name && name.trim().length > 0 ? name.trim() : undefined,
        description,
        active,
        characterType: personaId,
        promptConfig: {
          personality_id: characterId,
          personality_label: selectedCharacterLabel,
          ...(personaId === 'finance_expert' ? { risk_level: riskLevel } : {})
        },
        preferences: personaId === 'finance_expert' ? { risk_level: [riskLevel] } : {}
      };

      const savedAgent = isEditing && agent ? await updateAgent(agent.id, payload) : await createAgent(payload);

      await saveAgentPrompt(savedAgent.id, { model, systemPrompt, enabled: true });

      setSaveState('saved');
      message.success('Agent saved successfully.');
      onComplete?.();
    } catch {
      setSaveState('error');
      message.error('Failed to save agent configuration.');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_1.2fr]">
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <Title level={4} style={{ margin: 0 }}>
              {isEditing ? 'Edit agent' : 'Agent setup wizard'}
            </Title>
            <Text aria-label="Wizard progress" type="secondary">
              Step {currentStep + 1} of {STEPS.length}
            </Text>
          </div>
          {/* Compact progress bar on mobile keeps the stepper from eating the whole screen;
              the full icon+title Steps component is restored on sm+ where there's room. */}
          <Progress
            percent={((currentStep + 1) / STEPS.length) * 100}
            showInfo={false}
            size="small"
            className="sm:hidden"
            style={{ marginTop: 16 }}
          />
          <Steps
            current={currentStep}
            size="small"
            titlePlacement="vertical"
            items={STEPS.map((step) => ({ title: step.title, icon: step.icon }))}
            onChange={onStepChange}
            style={{ marginTop: 16 }}
            className="hidden sm:flex"
          />
        </Card>

        {validationError && (
          <Alert
            type="warning"
            showIcon
            message={validationError}
            className="rounded-md"
          />
        )}

        <div key={currentStep} className="space-y-4 transition-opacity duration-200">
          {currentStep === 0 && (
            <Card title="Choose character">
              <Paragraph type="secondary">
                Start with a character, then pick one of its personality styles.
              </Paragraph>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {PROMPT_PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => onPersonaChange(persona.id)}
                    className={`rounded-md border-2 p-3 text-left text-foreground transition-all ${personaId === persona.id ? 'border-[#722ed1] !bg-card shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : '!bg-card border-border hover:border-[#9d6fe8]'}`}
                    aria-label={`Character ${persona.name}`}
                  >
                    <p className="font-semibold">{persona.name}</p>
                    <p className="text-xs text-muted-foreground">{persona.tagline}</p>
                    <Tag className="mt-2">Characters: {persona.characters.length}</Tag>
                  </button>
                ))}
              </div>
              <Paragraph className="!mb-2 mt-4 text-xs text-muted-foreground">
                Personalities for {selectedPersonaLabel}
              </Paragraph>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {availableCharacters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => onCharacterChange(character.id)}
                    className={`rounded-md border-2 p-3 text-left text-foreground transition-all ${characterId === character.id ? 'border-[#722ed1] !bg-card shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : '!bg-card border-border hover:border-[#9d6fe8]'}`}
                    aria-label={`Personality ${character.name}`}
                  >
                    <p className="font-semibold">{character.name}</p>
                    <p className="text-xs text-muted-foreground">{character.tagline}</p>
                    <Tag className="mt-2">Risk: {character.riskLevel}</Tag>
                  </button>
                ))}
              </div>

              <Form layout="vertical" className="mt-4">
                <div className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Your agent will appear as</p>
                  <p className="font-medium">{agentDisplayLabel}</p>
                </div>
                <Form.Item label="Agent name">
                  <Input aria-label="Agent name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
                </Form.Item>
                <Form.Item label="Description" extra="Keep it brief. You can refine behavior in the next step.">
                  <TextArea
                    aria-label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                  />
                </Form.Item>
                <Form.Item label="Active">
                  <Switch aria-label="Active toggle" checked={active} onChange={setActive} />
                </Form.Item>
              </Form>
            </Card>
          )}

          {currentStep === 1 && (
            <Card title="Configure personality">
              <Paragraph type="secondary">Tune personality behavior, cadence, and prompt in one place.</Paragraph>
              <Form layout="vertical">
              <div className="grid gap-2 sm:grid-cols-1 md:grid-cols-2">
                  <Form.Item label="Character">
                    <Input aria-label="Selected character" value={selectedPersonaLabel} disabled />
                  </Form.Item>
                  <Form.Item label="Personality">
                    <Input aria-label="Selected personality" value={selectedCharacterLabel} disabled />
                  </Form.Item>
                  {personaId === 'finance_expert' ? (
                    <Form.Item label="Risk level">
                      <Select
                        aria-label="Risk level"
                        value={riskLevel}
                        onChange={(value) => setRiskLevel(value as 'low' | 'medium' | 'high')}
                        options={[
                          { value: 'low', label: 'Low' },
                          { value: 'medium', label: 'Medium' },
                          { value: 'high', label: 'High' }
                        ]}
                      />
                    </Form.Item>
                  ) : (
                    <Paragraph className="text-xs text-muted-foreground">Risk level is only used for finance expert personality</Paragraph>
                  )}
                </div>

                <Form.Item label="Model">
                  <Select
                    aria-label="Claude model"
                    value={model}
                    onChange={setModel}
                    options={[
                      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
                      { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' }
                    ]}
                  />
                </Form.Item>
                <Form.Item label="System prompt" extra="Edit only what you need — start from the selected character prompt.">
                  <TextArea
                    aria-label="System prompt"
                    rows={8}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.currentTarget.value)}
                  />
                </Form.Item>

              </Form>

            </Card>
          )}

          {currentStep === 2 && (
            <Card title="Save agent">
              <Paragraph type="secondary">
                Final check before saving: prompt and report output shape in one place.
              </Paragraph>
              <div className="mb-3 grid gap-3 lg:grid-cols-2">
                <Card size="small" title="Prompt preview">
                  <Paragraph className="mb-2 text-xs text-muted-foreground">
                    Character: <Tag>{selectedPersonaLabel}</Tag> Personality: <Tag>{selectedCharacterLabel}</Tag> Model: <Tag>{model}</Tag>
                  </Paragraph>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
                    {systemPrompt}
                  </pre>
                </Card>
                <Card size="small" title="Report shape preview">
                  <pre className="overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">{`{
  "agent": "${agentDisplayLabel}",
  "character": "${personaId}",
  "personality": "${characterId}",
  "risk_level": ${personaId === 'finance_expert' ? `"${riskLevel}"` : 'null'},
  "sources_managed_in": "Sources hub",
  "schedule_managed_in": "Playbooks hub",
  "sections": ["market_summary", "signals", "risks", "sources"]
}`}</pre>
                </Card>
              </div>
              <Paragraph className="!mb-1">
                Ready to save <strong>{agentDisplayLabel}</strong>.
              </Paragraph>
              <Paragraph type="secondary" className="!mb-3">
                You can still go back to tweak character and personality.
              </Paragraph>
              {saveState === 'saved' ? (
                <p data-testid="agent-save-state" className="text-sm text-green-700">
                  Agent saved successfully.
                </p>
              ) : null}
              {saveState === 'error' ? (
                <p data-testid="agent-save-state" className="text-sm text-red-700">
                  Save failed. Please check inputs.
                </p>
              ) : null}
            </Card>
          )}
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 flex justify-between border-t border-border bg-background px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex gap-2">
            <Button onClick={backStep} disabled={currentStep === 0}>Back</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
          <Button
            type="primary"
            onClick={currentStep === STEPS.length - 1 ? onSave : nextStep}
            loading={saveState === 'saving' && currentStep === STEPS.length - 1}
          >
            {currentStep === STEPS.length - 1 ? 'Save agent' : 'Next'}
          </Button>
        </div>
      </div>

      <Card className="hidden lg:sticky lg:top-4 lg:block lg:h-fit" title="Live summary">
        <p className="text-sm">Agent: {agentDisplayLabel}</p>
        <p className="text-sm">Active: {active ? 'Yes' : 'No'}</p>
        <p className="text-sm">Sources: managed from Sources hub</p>
        <p className="text-sm">Schedule: managed from Playbooks hub</p>
        <p className="text-sm">Character: {selectedPersonaLabel}</p>
        <p className="text-sm">Personality: {selectedCharacterLabel}</p>
      </Card>
    </div>
  );
}
