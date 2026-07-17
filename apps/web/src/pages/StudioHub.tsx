import React, { useEffect, useState } from 'react';
import { Button, Empty, Popconfirm, Spin, Tag, Tooltip, Typography, message } from 'antd';
import { AudioOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { deleteDiscussion, listDiscussions, triggerDiscussionRun, type DiscussionDto } from '../api/discussions';
import { StudioPrimaryButton } from '../components/StudioPrimaryButton';

const { Title } = Typography;

const FORMAT_COLORS: Record<string, string> = {
  free_form: 'blue',
  structured: 'purple',
  hosted: 'orange',
  hybrid: 'geekblue'
};

const FORMAT_HEX: Record<string, string> = {
  free_form: '#1677ff',
  structured: '#722ed1',
  hosted: '#fa8c16',
  hybrid: '#2f54eb'
};

const SPEAKER_HEX = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2'];

export function StudioHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [discussions, setDiscussions] = useState<DiscussionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    listDiscussions()
      .then(setDiscussions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleRunNow(d: DiscussionDto, e: React.MouseEvent) {
    e.stopPropagation();
    setRunningId(d.id);
    try {
      await triggerDiscussionRun(d.id);
      navigate(`/studio/${d.id}`);
    } catch {
      message.error('Failed to start run');
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDiscussion(id);
      setDiscussions((prev) => prev.filter((d) => d.id !== id));
    } catch {
      message.error('Failed to delete discussion');
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Title level={3} style={{ margin: 0 }}>
          <AudioOutlined style={{ marginRight: 8 }} />
          {t('studio.title')}
        </Title>
        {discussions.length > 0 && (
          <StudioPrimaryButton icon={<PlusOutlined />} onClick={() => navigate('/studio/new')}>
            {t('studio.newDiscussion')}
          </StudioPrimaryButton>
        )}
      </div>

      {discussions.length === 0 ? (
        <Empty
          image={<TeamOutlined style={{ fontSize: 64, color: '#722ed1', opacity: 0.4 }} />}
          description={
            <div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{t('studio.emptyTitle')}</div>
              <div style={{ opacity: 0.6, maxWidth: 400, margin: '0 auto' }}>{t('studio.emptyDesc')}</div>
            </div>
          }
          style={{ marginTop: 48, marginBottom: 48 }}
        >
          <StudioPrimaryButton icon={<PlusOutlined />} onClick={() => navigate('/studio/new')}>
            {t('studio.newDiscussion')}
          </StudioPrimaryButton>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {discussions.map((d, i) => (
            <div
              key={d.id}
              className="ct-animate-enter flex cursor-pointer items-center gap-4 border-b border-border bg-card px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/50"
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => navigate(`/studio/${d.id}`)}
            >
              {/* Format dot indicator — replaces the old card grid */}
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: FORMAT_HEX[d.format] ?? '#888',
                  flexShrink: 0
                }}
              />

              {/* Body */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{d.name}</span>
                  <Tag color={FORMAT_COLORS[d.format] ?? 'default'} style={{ fontSize: 11, margin: 0 }}>
                    {t(`studio.format_${d.format}`)}
                  </Tag>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {d.participants.map((p) => (
                    <Tooltip key={p.id} title={`Agent ${p.agentId.slice(0, 8)}`}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: SPEAKER_HEX[p.speakerOrder % SPEAKER_HEX.length],
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      >
                        {p.speakerOrder + 1}
                      </span>
                    </Tooltip>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    {d.participants.length} {t('studio.participants')}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="small"
                  loading={runningId === d.id}
                  onClick={(e) => handleRunNow(d, e)}
                >
                  {t('studio.runNow')}
                </Button>
                <Popconfirm
                  title={t('common.delete') + '?'}
                  onConfirm={(e) => { e?.stopPropagation(); handleDelete(d.id); }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button size="small" danger>
                    {t('common.delete')}
                  </Button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
