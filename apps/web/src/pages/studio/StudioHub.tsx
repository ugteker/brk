import React, { useEffect, useState } from 'react';
import { Button, Empty, Popconfirm, Spin, Tooltip, Typography, message } from 'antd';
import { AudioOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSafeNavigate } from '../../utils/useSafeNavigate';
import { deleteDiscussion, listDiscussions, triggerDiscussionRun, type DiscussionDto } from '../../api/discussions';
import { StudioPrimaryButton } from '../../components/StudioPrimaryButton';
import { DiscussionCover } from '../../components/DiscussionCover';
import { useAppData } from '../../context/AppDataContext';

const { Title } = Typography;

const FORMAT_HEX: Record<string, string> = {
  free_form: '#1677ff',
  structured: '#722ed1',
  hosted: '#fa8c16',
  hybrid: '#2f54eb'
};

const SPEAKER_HEX = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2'];

export function StudioHub() {
  const { t } = useTranslation();
  const navigate = useSafeNavigate();
  const { agents } = useAppData();
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
      message.error(t('studio.failedToStartRun'));
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDiscussion(id);
      setDiscussions((prev) => prev.filter((d) => d.id !== id));
    } catch {
      message.error(t('studio.failedToDeleteDiscussion'));
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
          <StudioPrimaryButton
            className="studio-new-discussion-button"
            icon={<PlusOutlined />}
            aria-label={t('studio.newDiscussion')}
            onClick={() => navigate('/studio/new')}
          >
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {discussions.map((d, i) => {
            const hex = FORMAT_HEX[d.format] ?? '#722ed1';
            const active = d.participants.filter((p) => p.active);
            const castNames = active
              .map((p) => agents.find((a) => a.id === p.agentId)?.name)
              .filter((n): n is string => Boolean(n));
            return (
              <div
                key={d.id}
                className="ct-animate-enter aurora-lift cursor-pointer overflow-hidden rounded-xl border border-border bg-card"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => navigate(`/studio/${d.id}`)}
              >
                {/* Procedural cover, seeded per discussion */}
                <div className="relative flex h-24 items-end px-4 pb-2">
                  <DiscussionCover id={d.id} format={d.format} className="absolute inset-0 h-full w-full" />
                  <div className="relative flex items-center" style={{ marginLeft: 4 }}>
                    {active.map((p, idx) => {
                      const agentName = agents.find((a) => a.id === p.agentId)?.name;
                      return (
                        <Tooltip key={p.id} title={agentName ?? `${t('studio.participants')} ${p.speakerOrder + 1}`}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: SPEAKER_HEX[p.speakerOrder % SPEAKER_HEX.length],
                              color: '#fff',
                              fontSize: 13,
                              fontWeight: 600,
                              border: '2px solid var(--card, #fff)',
                              marginLeft: idx === 0 ? 0 : -10,
                              zIndex: active.length - idx
                            }}
                          >
                            {agentName ? agentName.charAt(0).toUpperCase() : p.speakerOrder + 1}
                          </span>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-semibold">{d.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '1px 9px',
                        borderRadius: 999,
                        color: hex,
                        background: `${hex}1f`,
                        border: `1px solid ${hex}55`
                      }}
                    >
                      {t(`studio.format_${d.format}`)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {castNames.length > 0
                        ? castNames.join(' · ')
                        : `${active.length} ${t('studio.participants')}`}
                    </span>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={t('studio.runNow')}>
                        <Button
                          type="text"
                          shape="circle"
                          aria-label={t('studio.runNow')}
                          loading={runningId === d.id}
                          icon={<PlayCircleOutlined />}
                          style={{
                            color: '#fff',
                            background: `radial-gradient(140% 200% at 50% -30%, rgba(255,255,255,0.4), transparent 60%), linear-gradient(135deg, ${hex}cc, ${hex}99)`,
                            boxShadow: `0 0 14px ${hex}66`
                          }}
                          onClick={(e) => handleRunNow(d, e)}
                        />
                      </Tooltip>
                      <Tooltip title={t('studio.editDiscussion')}>
                        <Button
                          type="text"
                          shape="circle"
                          aria-label={t('studio.editDiscussion')}
                          icon={<EditOutlined />}
                          onClick={() => navigate(`/studio/${d.id}`)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title={t('common.confirmDelete', { label: 'discussion' })}
                        onConfirm={(e) => { e?.stopPropagation(); handleDelete(d.id); }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          type="text"
                          shape="circle"
                          danger
                          aria-label={t('common.delete')}
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
