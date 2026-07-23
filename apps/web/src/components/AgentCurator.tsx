import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Form, Input, Select, Skeleton, Typography } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TouchSafeTooltip } from './TouchSafeTooltip';
import type { CharacterType } from '../api/agents';
import {
  finalizeAgentCuration,
  getAgentCurationSession,
  sendAgentCurationMessage,
  startAgentCuration,
  type AgentCurationApiError,
  type CurationDraft,
  type CurationDraftPatch,
  type CurationProfileField,
  type CurationSession,
  type CurationSourceContext,
  type SendAgentCurationMessageInput,
  type CuratedAgent
} from '../api/agent-curation';

export type { CuratedAgent } from '../api/agent-curation';

const { TextArea } = Input;
const { Paragraph } = Typography;

const CHARACTER_TYPES: CharacterType[] = ['finance_expert', 'teacher', 'trainer', 'philosopher', 'influencer', 'summarizer'];

type EditableReviewField = Exclude<CurationProfileField, 'avatar'>;

const STARTER_SUGGESTION_KEYS = ['curator.starter1', 'curator.starter2', 'curator.starter3'];

interface ActionError {
  operation: 'message' | 'finalize';
  message: string;
  retryable: boolean;
  missingFields?: string[];
}

export interface AgentCuratorProps {
  mode: 'create' | 'update';
  targetAgentId?: string | null;
  sourceContext?: CurationSourceContext;
  currentAgentProfile?: CurationDraftPatch;
  initialDraft?: CurationDraftPatch;
  sessionId?: string;
  onComplete: (agent: CuratedAgent) => void;
  onCancel: () => void;
  onBusyChange?: (isBusy: boolean) => void;
}

function errorDetails(error: unknown, fallback: string): {
  message: string;
  retryable: boolean;
  missingFields?: string[];
} {
  if (typeof error === 'object' && error !== null) {
    const apiError = error as Partial<AgentCurationApiError>;
    return {
      message: typeof apiError.message === 'string' && apiError.message ? apiError.message : fallback,
      retryable: apiError.retryable === true,
      missingFields: Array.isArray(apiError.missingFields) ? apiError.missingFields : undefined
    };
  }
  return { message: fallback, retryable: false };
}

function draftForFinalization(draft: CurationDraft): CurationDraft {
  return { ...draft, avatar: null };
}

function createClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `curation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fieldLabelKey(field: EditableReviewField): string {
  return field === 'characterType'
    ? 'curator.fieldPersonality'
    : field === 'systemPrompt'
      ? 'curator.fieldInstructions'
      : field === 'name'
        ? 'curator.fieldName'
        : 'curator.fieldDescription';
}

export function AgentCurator({
  mode,
  targetAgentId,
  sourceContext,
  currentAgentProfile,
  initialDraft,
  sessionId,
  onComplete,
  onCancel,
  onBusyChange
}: AgentCuratorProps) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState<CurationSession | null>(null);
  const [reviewDraft, setReviewDraft] = useState<CurationDraft | null>(null);
  const [messageText, setMessageText] = useState('');
  const [dirtyFields, setDirtyFields] = useState<EditableReviewField[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const lastFailedMessage = useRef<SendAgentCurationMessageInput | null>(null);
  const initializationGeneration = useRef(0);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const isBusy = loading || sending || finalizing;
  const canReview = reviewDraft?.completeness === 'ready_for_review';

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const applySession = useCallback((nextSession: CurationSession, nextDraft = nextSession.draft) => {
    setSession(nextSession);
    setReviewDraft(nextDraft);
    setDirtyFields([]);
  }, []);

  // Start-config props are read through a ref and the effect below is keyed on their
  // serialized content: callers often pass inline object literals (new identity every
  // render), which would otherwise re-trigger initialization in an endless loop.
  const startConfigRef = useRef({ mode, targetAgentId, sourceContext, currentAgentProfile, initialDraft, sessionId, language: i18n.language });
  startConfigRef.current = { mode, targetAgentId, sourceContext, currentAgentProfile, initialDraft, sessionId, language: i18n.language };
  const startConfigKey = JSON.stringify(startConfigRef.current);

  const initialize = useCallback(async () => {
    const generation = ++initializationGeneration.current;
    const { mode, targetAgentId, sourceContext, currentAgentProfile, initialDraft, sessionId, language } = startConfigRef.current;
    setLoading(true);
    setStartError(null);
    setActionError(null);
    try {
      const nextSession = sessionId
        ? await getAgentCurationSession(sessionId)
        : await startAgentCuration({
            mode,
            targetAgentId,
            sourceContext,
            currentAgentProfile,
            initialDraft,
            language
          });
      if (generation === initializationGeneration.current) {
        applySession(nextSession);
        setSuggestions([]);
      }
    } catch (error) {
      if (generation === initializationGeneration.current) {
        setStartError(errorDetails(error, t('curator.errorStart')).message);
      }
    } finally {
      if (generation === initializationGeneration.current) {
        setLoading(false);
      }
    }
  }, [applySession, t]);

  useEffect(() => {
    void initialize();
    return () => {
      initializationGeneration.current += 1;
    };
  }, [initialize, startConfigKey]);

  function updateReviewField(field: EditableReviewField, value: string | CharacterType | null) {
    setReviewDraft((current) => (current ? { ...current, [field]: value } as CurationDraft : current));
    setDirtyFields((current) => (current.includes(field) ? current : [...current, field]));
  }

  async function submitMessage(input: SendAgentCurationMessageInput, clearInput = false) {
    if (!session || !input.text.trim()) return;

    setSending(true);
    setActionError(null);
    lastFailedMessage.current = input;
    try {
      const reply = await sendAgentCurationMessage(session.id, input);
      applySession(reply.session, reply.draft);
      setSuggestions(reply.suggestedReplies);
      if (clearInput) setMessageText('');
      lastFailedMessage.current = null;
      return reply.draft;
    } catch (error) {
      const details = errorDetails(error, t('curator.errorMessage'));
      setActionError({ operation: 'message', ...details });
      return null;
    } finally {
      setSending(false);
    }
  }

  function sendFreeformMessage() {
    void submitMessage({ text: messageText.trim(), clientRequestId: createClientRequestId() }, true);
  }

  function sendSuggestion(suggestion: string) {
    void submitMessage({ text: suggestion, clientRequestId: createClientRequestId() });
  }

  async function finalize() {
    if (!session || !reviewDraft || !canReview) return;

    setFinalizing(true);
    setActionError(null);
    try {
      let draft = reviewDraft;
      if (dirtyFields.length > 0) {
        const userDraftPatch = dirtyFields.reduce<CurationDraftPatch>(
          (patch, field) => ({ ...patch, [field]: reviewDraft[field] }),
          {}
        );
        const persistedDraft = await submitMessage(
          {
            text: 'I updated the reviewed profile fields.',
            userDraftPatch,
            clientRequestId: createClientRequestId()
          },
          false
        );
        if (!persistedDraft) return;
        draft = persistedDraft;
      }

      const result = await finalizeAgentCuration(session.id, draftForFinalization(draft));
      applySession(result.session);
      setSuggestions([]);
      onComplete(result.agent);
    } catch (error) {
      const details = errorDetails(error, t('curator.errorFinalize'));
      setActionError({ operation: 'finalize', ...details });
    } finally {
      setFinalizing(false);
    }
  }

  function retryAction() {
    if (!actionError) return;
    if (actionError.operation === 'message' && lastFailedMessage.current) {
      void submitMessage(lastFailedMessage.current);
      return;
    }
    if (actionError.operation === 'finalize') {
      void finalize();
    }
  }

  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (canReview) setReviewOpen(true);
  }, [canReview]);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Agent curator loading" className="py-2">
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    );
  }

  if (startError) {
    return (
      <div className="py-2">
        <Alert
          type="error"
          showIcon
          title={startError}
          action={
            <Button size="small" onClick={() => void initialize()}>
              {t('curator.retry')}
            </Button>
          }
        />
        <div className="mt-4">
          <Button shape="round" onClick={onCancel}>{t('curator.back')}</Button>
        </div>
      </div>
    );
  }

  if (!session || !reviewDraft) return null;

  const profileFields: EditableReviewField[] = ['name', 'description', 'characterType', 'systemPrompt'];
  const lastCuratorMessage = [...session.messages].reverse().find((item) => item.role !== 'user');
  const userMessageCount = session.messages.filter((item) => item.role === 'user').length;
  const isFirstStep = userMessageCount === 0;
  const sourceTitle = sourceContext && typeof sourceContext.title === 'string' ? sourceContext.title.trim() : '';
  const showSourceInspiration =
    Boolean(sourceTitle) && userMessageCount === 1 && Boolean(lastCuratorMessage) && !sending;
  const visibleSuggestions = suggestions.length > 0 ? suggestions : isFirstStep ? STARTER_SUGGESTION_KEYS.map((key) => t(key)) : [];

  const errorBanner = actionError ? (
    <Alert
      className="mb-4"
      type={actionError.operation === 'finalize' ? 'error' : 'warning'}
      showIcon
      title={actionError.message}
      description={
        actionError.missingFields?.length
          ? t('curator.stillNeeded', {
              fields: actionError.missingFields.map((field) => t(fieldLabelKey(field as EditableReviewField))).join(', ')
            })
          : undefined
      }
      action={
        actionError.retryable ? (
          <Button size="small" onClick={retryAction} disabled={isBusy}>
            {t('curator.retry')}
          </Button>
        ) : undefined
      }
    />
  ) : null;

  if (canReview && reviewOpen) {
    return (
      <div className="py-1">
        {errorBanner}
        <div className="mb-4">
          <p className="m-0 text-lg font-semibold text-foreground">{t('curator.readyTitle')}</p>
          <Paragraph type="secondary" className="!mb-0 !mt-1">
            {t('curator.readySub')}
          </Paragraph>
        </div>
        <Form layout="vertical">
          <Form.Item label={t('curator.nameLabel')} className="!mb-3">
            <Input
              aria-label="Agent name"
              value={reviewDraft.name}
              disabled={isBusy}
              onChange={(event) => updateReviewField('name', event.currentTarget.value)}
            />
          </Form.Item>
          <Form.Item label={t('curator.descriptionLabel')} className="!mb-3">
            <TextArea
              aria-label="Description"
              autoSize={{ minRows: 2, maxRows: 4 }}
              value={reviewDraft.description}
              disabled={isBusy}
              onChange={(event) => updateReviewField('description', event.currentTarget.value)}
            />
          </Form.Item>
        </Form>
        <Collapse
          ghost
          className="-mx-3 mb-3"
          items={[
            {
              key: 'advanced',
              label: t('curator.advanced'),
              children: (
                <Form layout="vertical">
                  <Form.Item label={t('curator.personality')} className="!mb-3">
                    <Select
                      aria-label="Character type"
                      value={reviewDraft.characterType ?? undefined}
                      disabled={isBusy}
                      onChange={(value) => updateReviewField('characterType', value as CharacterType)}
                      options={CHARACTER_TYPES.map((value) => ({ value, label: t(`personas.${value}.name`) }))}
                    />
                  </Form.Item>
                  <Form.Item label={t('curator.instructions')} className="!mb-0">
                    <TextArea
                      aria-label="System prompt"
                      autoSize={{ minRows: 6, maxRows: 12 }}
                      value={reviewDraft.systemPrompt}
                      disabled={isBusy}
                      onChange={(event) => updateReviewField('systemPrompt', event.currentTarget.value)}
                    />
                  </Form.Item>
                </Form>
              )
            }
          ]}
        />
        <div className="curator-actions mt-4 flex items-center justify-between gap-2">
          <TouchSafeTooltip title={t('curator.back')}>
            <Button
              aria-label={t('curator.back')}
              className="mobile-wizard-button"
              shape="round"
              icon={<ArrowLeftOutlined />}
              onClick={() => setReviewOpen(false)}
              disabled={isBusy}
            >
              <span className="mobile-button-label">{t('curator.back')}</span>
            </Button>
          </TouchSafeTooltip>
          <TouchSafeTooltip title={mode === 'create' ? t('curator.createAgent') : t('curator.saveChanges')}>
            <Button
              aria-label={mode === 'create' ? t('curator.createAgent') : t('curator.saveChanges')}
              className="mobile-wizard-button"
              type="primary"
              shape="round"
              size="large"
              icon={<CheckCircleOutlined />}
              onClick={() => void finalize()}
              loading={finalizing}
              disabled={isBusy}
            >
              <span className="mobile-button-label">
                {mode === 'create' ? t('curator.createAgent') : t('curator.saveChanges')}
              </span>
            </Button>
          </TouchSafeTooltip>
        </div>
      </div>
    );
  }

  const collectedCount = profileFields.filter((field) => !reviewDraft.missingFields.includes(field)).length;
  const progressPct = Math.round((collectedCount / profileFields.length) * 100);

  return (
    <div className="py-1">
      {errorBanner}

      <div className="mb-5" aria-label="Profile progress">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {progressPct === 0 ? t('curator.progressStart') : progressPct < 100 ? t('curator.progressCollecting') : t('curator.progressDone')}
          </span>
          <span className="text-xs font-semibold text-[#722ed1]">{progressPct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#722ed1] to-[#eb2f96] transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progressPct, 4)}%` }}
          />
        </div>
      </div>

      <div aria-live="polite" className="mb-4 min-h-[4.5rem]">
        {showSourceInspiration ? (
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t('curator.inspiredBy', { source: sourceTitle })}
          </p>
        ) : null}
        <p className={`m-0 text-lg font-semibold leading-snug text-foreground ${sending ? 'animate-pulse' : ''}`} style={{ textWrap: 'balance' }}>
          {sending
            ? t('curator.thinking')
            : lastCuratorMessage
              ? lastCuratorMessage.content
              : t('curator.firstQuestion')}
        </p>
      </div>

      {visibleSuggestions.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Suggested answers">
          {visibleSuggestions.map((suggestion) => (
            <Button
              key={suggestion}
              shape="round"
              onClick={() => sendSuggestion(suggestion)}
              disabled={isBusy}
              className="!h-auto whitespace-normal py-1 text-left"
            >
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}

      <TextArea
        aria-label="Your answer"
        autoSize={{ minRows: 2, maxRows: 4 }}
        value={messageText}
        disabled={isBusy}
        onChange={(event) => setMessageText(event.currentTarget.value)}
        onPressEnter={(event) => {
          if (!event.shiftKey && messageText.trim() && !isBusy) {
            event.preventDefault();
            sendFreeformMessage();
          }
        }}
        placeholder={t('curator.placeholder')}
        className="!rounded-xl"
      />

      <div className="curator-actions mt-4 flex items-center justify-between gap-2">
        <TouchSafeTooltip title={t('curator.back')}>
          <Button
            aria-label={t('curator.back')}
            className="mobile-wizard-button"
            shape="round"
            icon={<ArrowLeftOutlined />}
            onClick={onCancel}
            disabled={isBusy}
          >
            <span className="mobile-button-label">{t('curator.back')}</span>
          </Button>
        </TouchSafeTooltip>
        {canReview ? (
          <TouchSafeTooltip title={t('curator.reviewAgent')}>
            <Button
              aria-label={t('curator.reviewAgent')}
              className="mobile-wizard-button"
              type="primary"
              shape="round"
              size="large"
              icon={<ArrowRightOutlined />}
              onClick={() => setReviewOpen(true)}
              disabled={isBusy}
            >
              <span className="mobile-button-label">{t('curator.reviewAgent')}</span>
            </Button>
          </TouchSafeTooltip>
        ) : (
          <TouchSafeTooltip title={t('curator.continue')}>
            <Button
              aria-label={t('curator.continue')}
              className="mobile-wizard-button"
              type="primary"
              shape="round"
              size="large"
              icon={<ArrowRightOutlined />}
              onClick={sendFreeformMessage}
              loading={sending}
              disabled={!messageText.trim() || isBusy}
            >
              <span className="mobile-button-label">{t('curator.continue')}</span>
            </Button>
          </TouchSafeTooltip>
        )}
      </div>
    </div>
  );
}
