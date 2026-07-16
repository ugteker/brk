import { useEffect, useRef, useState } from 'react';
import { Button, Input, Spin, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { askReportQuestion, listReportChatMessages, type ReportChatMessageDto } from '../api/agents';

interface ReportChatPanelProps {
  agentId: string;
  reportId: string;
}

/**
 * Inline "Ask the analyst" chat under a report card. Questions are answered by the agent's
 * persona grounded in this specific report and the evidence it was based on. History is
 * per-user-per-report and persists across sessions.
 */
export function ReportChatPanel({ agentId, reportId }: ReportChatPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ReportChatMessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listReportChatMessages(agentId, reportId)
      .then((history) => {
        if (!cancelled) setMessages(history);
      })
      .catch(() => {
        if (!cancelled) message.error(t('reportChat.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, reportId, t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, asking]);

  async function onAsk() {
    const question = draft.trim();
    if (!question || asking) return;
    setAsking(true);
    setDraft('');
    // Optimistically show the question while Claude thinks.
    const optimistic: ReportChatMessageDto = {
      id: `optimistic-${Date.now()}`,
      reportId,
      userId: 'me',
      role: 'user',
      content: question,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const newMessages = await askReportQuestion(agentId, reportId, question);
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), ...newMessages]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(question);
      message.error(err instanceof Error ? err.message : t('reportChat.askFailed'));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" onClick={(event) => event.stopPropagation()}>
      <p className="mb-2 text-sm font-medium">{t('reportChat.title')}</p>
      <div ref={scrollRef} className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <div className="py-4 text-center">
            <Spin size="small" />
          </div>
        ) : messages.length === 0 && !asking ? (
          <p className="text-xs text-gray-400">{t('reportChat.empty')}</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user' ? 'bg-blue-500 text-white' : 'border border-gray-200 bg-white text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {asking ? (
          <div className="flex justify-start">
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400">
              <Spin size="small" className="mr-2" />
              {t('reportChat.thinking')}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <Input.TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('reportChat.placeholder')}
          autoSize={{ minRows: 1, maxRows: 4 }}
          maxLength={2000}
          disabled={asking}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              void onAsk();
            }
          }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={asking}
          disabled={!draft.trim()}
          onClick={() => void onAsk()}
          aria-label={t('reportChat.send')}
        />
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{t('reportChat.disclaimer')}</p>
    </div>
  );
}
