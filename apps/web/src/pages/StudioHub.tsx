import React, { useEffect, useState } from 'react';
import { Button, Card, Empty, Popconfirm, Spin, Tag, Tooltip, message } from 'antd';
import { AudioOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { deleteDiscussion, listDiscussions, triggerDiscussionRun, type DiscussionDto } from '../api/discussions';
import { StudioLayout } from '../components/StudioLayout';

const FORMAT_COLORS: Record<string, string> = {
  free_form: 'blue',
  structured: 'purple',
  hosted: 'orange',
  hybrid: 'geekblue'
};

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
      <StudioLayout>
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin size="large" />
        </div>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>
          <AudioOutlined style={{ marginRight: 8 }} />
          {t('studio.title')}
        </h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/studio/new')}>
          {t('studio.newDiscussion')}
        </Button>
      </div>

      {discussions.length === 0 ? (
        <Empty
          image={<TeamOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
          description={
            <div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{t('studio.emptyTitle')}</div>
              <div style={{ color: '#888', maxWidth: 400, margin: '0 auto' }}>{t('studio.emptyDesc')}</div>
            </div>
          }
          style={{ marginTop: 80 }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/studio/new')}>
            {t('studio.newDiscussion')}
          </Button>
        </Empty>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16
          }}
        >
          {discussions.map((d) => (
            <Card
              key={d.id}
              hoverable
              onClick={() => navigate(`/studio/${d.id}`)}
              actions={[
                <Button
                  key="run"
                  size="small"
                  loading={runningId === d.id}
                  onClick={(e) => handleRunNow(d, e)}
                >
                  {t('studio.runNow')}
                </Button>,
                <Popconfirm
                  key="del"
                  title={t('common.delete') + '?'}
                  onConfirm={(e) => { e?.stopPropagation(); handleDelete(d.id); }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button size="small" danger>
                    {t('common.delete')}
                  </Button>
                </Popconfirm>
              ]}
            >
              <Card.Meta
                title={
                  <span>
                    <AudioOutlined style={{ marginRight: 6 }} />
                    {d.name}
                  </span>
                }
                description={
                  <div>
                    <Tag color={FORMAT_COLORS[d.format] ?? 'default'}>{t(`studio.format_${d.format}`)}</Tag>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {d.participants.map((p) => (
                        <Tooltip key={p.id} title={`Agent ${p.agentId.slice(0, 8)}`}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: '#1890ff',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            {p.speakerOrder + 1}
                          </span>
                        </Tooltip>
                      ))}
                      <span style={{ fontSize: 12, color: '#888' }}>
                        {d.participants.length} {t('studio.participants')}
                      </span>
                    </div>
                  </div>
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
    </StudioLayout>
  );
}
