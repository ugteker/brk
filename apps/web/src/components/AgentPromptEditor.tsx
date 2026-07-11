import { useState } from 'react';
import { Button, Form, Input, Select, Switch, message } from 'antd';
import { saveAgentPrompt } from '../api/agents';

const { TextArea } = Input;

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' }
];

interface AgentPromptEditorProps {
  agentId: string;
  initialModel?: string;
  initialSystemPrompt?: string;
  initialEnabled?: boolean;
  onSaved?: () => void;
}

export function AgentPromptEditor({
  agentId,
  initialModel = 'claude-sonnet-4-5',
  initialSystemPrompt = '',
  initialEnabled = true,
  onSaved
}: AgentPromptEditorProps) {
  const [model, setModel] = useState(initialModel);
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function onSave() {
    try {
      setSaveState('saving');
      await saveAgentPrompt(agentId, { model, systemPrompt, enabled });
      setSaveState('saved');
      message.success('System prompt saved');
      onSaved?.();
    } catch {
      setSaveState('error');
      message.error('Failed to save system prompt');
    }
  }

  return (
    <Form layout="vertical">
      <Form.Item label="Model">
        <Select aria-label="Claude model" value={model} onChange={setModel} options={MODEL_OPTIONS} />
      </Form.Item>
      <Form.Item label="System prompt">
        <TextArea
          aria-label="System prompt"
          rows={8}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.currentTarget.value)}
          placeholder="Explain what this agent should do with the crawled content, e.g. identify long/short stock signals with confidence and citations."
        />
      </Form.Item>
      <Form.Item label="Enabled">
        <Switch aria-label="Prompt enabled" checked={enabled} onChange={setEnabled} />
      </Form.Item>
      <Button type="primary" onClick={onSave} loading={saveState === 'saving'}>
        Save system prompt
      </Button>
      {saveState === 'error' ? <p className="text-sm text-red-600">Failed to save. Please try again.</p> : null}
    </Form>
  );
}
