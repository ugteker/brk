import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Progress, Tag, Typography } from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { artifactDownloadUrl, type RunDetailDto } from '../api/agents';
import { isHttpUrl } from '../utils/links';

const { Text, Paragraph } = Typography;

interface AgentRunsBrowserProps {
  agentId: string;
  runs: RunDetailDto[];
  onViewReport?: (reportId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'green',
  succeeded_no_new_content: 'cyan',
  failed: 'red',
  running: 'blue',
  queued: 'default'
};

const STATUS_LABELS: Record<string, string> = {
  succeeded_no_new_content: 'no new content'
};

const PHASE_LABELS: Record<string, string> = {
  crawling: 'Crawling sources…',
  analyzing: 'Analyzing with AI…',
  notifying: 'Sending notifications…'
};

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '—';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function AgentRunsBrowser({ agentId, runs, onViewReport }: AgentRunsBrowserProps) {
  const [expandedArtifactIds, setExpandedArtifactIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const hasRunningRun = runs.some((run) => run.status === 'running');

  // Only run a ticking clock while there's an actual in-progress run to show elapsed time for -
  // avoids an always-on timer/re-render loop once everything has settled into a terminal state.
  useEffect(() => {
    if (!hasRunningRun) return;
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [hasRunningRun]);

  function toggleArtifact(artifactId: string) {
    setExpandedArtifactIds((prev) => {
      const next = new Set(prev);
      if (next.has(artifactId)) {
        next.delete(artifactId);
      } else {
        next.add(artifactId);
      }
      return next;
    });
  }

  if (runs.length === 0) {
    return <Empty description="No runs yet. Run history appears here once the agent's schedule kicks in (or you trigger a manual run)." />;
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const elapsedMs = run.status === 'running' && run.startedAt ? now - new Date(run.startedAt).getTime() : null;
        return (
        <Card key={run.id} size="small" style={{ width: '100%' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={STATUS_COLORS[run.status] ?? 'default'}>{STATUS_LABELS[run.status] ?? run.status}</Tag>
              <Text type="secondary" className="text-xs">
                Scheduled {new Date(run.scheduledFor).toLocaleString()}
              </Text>
              {elapsedMs !== null ? (
                <span className="flex items-center gap-1">
                  <Progress
                    type="circle"
                    percent={100}
                    status="active"
                    size={20}
                    format={() => ''}
                  />
                  <Text type="secondary" className="text-xs">
                    · Running for {formatDuration(elapsedMs)}
                  </Text>
                  {run.phase && PHASE_LABELS[run.phase] ? (
                    <Tag color="processing">{PHASE_LABELS[run.phase]}</Tag>
                  ) : null}
                </span>
              ) : (
                <Text type="secondary" className="text-xs">
                  · Duration {formatDuration(run.durationMs)}
                </Text>
              )}
              {run.retryCount > 0 ? (
                <Text type="secondary" className="text-xs">
                  · Retry #{run.retryCount}
                </Text>
              ) : null}
            </div>
            {run.report ? (
              <Button size="small" onClick={() => onViewReport?.(run.report!.id)}>
                View report
              </Button>
            ) : null}
          </div>

          {run.errorCode ? (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 8 }}
              message={`Error: ${run.errorCode}`}
              description={run.errorMessage ?? 'No further details are available for this failure.'}
            />
          ) : null}

          {run.artifacts.length > 0 ? (
            <div className="mt-3 space-y-2">
              {run.artifacts.map((artifact) => {
                const isExpanded = expandedArtifactIds.has(artifact.id);
                return (
                  <Card key={artifact.id} size="small" type="inner" title={
                    <span className="flex items-center gap-1 text-xs font-normal">
                      <FileTextOutlined />{' '}
                      {isHttpUrl(artifact.sourceRef) ? (
                        <a href={artifact.sourceRef} target="_blank" rel="noreferrer">
                          {artifact.sourceRef}
                        </a>
                      ) : (
                        artifact.sourceRef
                      )}
                    </span>
                  }>
                    <Paragraph
                      className="mb-2 whitespace-pre-wrap text-xs"
                      ellipsis={isExpanded ? false : { rows: 3 }}
                    >
                      {artifact.contentPreview || 'No preview available.'}
                      {artifact.contentLength > artifact.contentPreview.length ? '…' : ''}
                    </Paragraph>
                    <div className="flex items-center gap-2">
                      {artifact.contentPreview.length > 0 ? (
                        <Button size="small" type="link" style={{ padding: 0 }} onClick={() => toggleArtifact(artifact.id)}>
                          {isExpanded ? 'Show less' : 'Show more'}
                        </Button>
                      ) : null}
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        href={artifactDownloadUrl(agentId, run.id, artifact.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download full content ({artifact.contentLength} chars)
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : null}
        </Card>
        );
      })}
    </div>
  );
}
