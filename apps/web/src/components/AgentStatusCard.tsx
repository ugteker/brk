import { useEffect, useState } from 'react';
import { Card, Tag, Typography } from 'antd';
import { listRecentRuns, type RecentRunDto } from '../api/agents';

const { Title, Text } = Typography;

const ROTATE_INTERVAL_MS = 4000;

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

export function AgentStatusCard() {
  const [runs, setRuns] = useState<RecentRunDto[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const recent = await listRecentRuns(3);
        if (alive) setRuns(recent);
      } catch {
        if (alive) setRuns([]);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (runs.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % runs.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [runs.length]);

  const activeRun = runs[activeIndex];

  return (
    <Card>
      <Title level={5} style={{ marginTop: 0 }}>
        Latest agent runtime status
      </Title>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <>
          <p className="text-sm">
            <Text strong>{activeRun.agentName}:</Text>{' '}
            <Tag color={STATUS_COLORS[activeRun.status] ?? 'default'}>
              {STATUS_LABELS[activeRun.status] ?? activeRun.status}
            </Tag>{' '}
            {activeRun.finishedAt
              ? new Date(activeRun.finishedAt).toLocaleString()
              : new Date(activeRun.scheduledFor).toLocaleString()}
          </p>
          <div className="flex items-center gap-1" aria-label="Recent run indicator">
            {runs.map((run, index) => (
              <span
                key={run.id}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: index === activeIndex ? '#722ed1' : 'hsl(225, 18%, 30%)',
                  display: 'inline-block'
                }}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
