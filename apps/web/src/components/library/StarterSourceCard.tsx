import { AudioOutlined, GlobalOutlined, YoutubeOutlined } from '@ant-design/icons';
import { Button, Card, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogSource } from '../../api/catalog';

const { Text } = Typography;

interface StarterSourceCardProps {
  source: CatalogSource;
  onSave: (source: CatalogSource) => Promise<void>;
}

function StarterTypeTag({ type }: { type: CatalogSource['type'] }) {
  if (type === 'youtube_videos') {
    return <Tag icon={<YoutubeOutlined />} color="red" className="m-0">YouTube</Tag>;
  }
  if (type === 'podcast_feeds') {
    return <Tag icon={<AudioOutlined />} color="purple" className="m-0">Podcast</Tag>;
  }
  return <Tag icon={<GlobalOutlined />} className="m-0">Web</Tag>;
}

export function StarterSourceCard({ source, onSave }: StarterSourceCardProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(source);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card size="small" className="h-full min-h-[170px]">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start gap-3">
          {source.coverImageUrl ? (
            <img
              src={source.coverImageUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
              {source.type === 'youtube_videos' ? '📺' : source.type === 'podcast_feeds' ? '🎙' : '🌐'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="blue" className="m-0">{t('library.starterPicks')}</Tag>
              <StarterTypeTag type={source.type} />
            </div>
            <div className="mt-2 text-base font-semibold leading-snug text-foreground">{source.title}</div>
            <Text type="secondary" className="mt-1 block text-xs">
              {source.summary}
            </Text>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <Text type="secondary" className="text-xs">
            {t('library.curatedForYou')}
          </Text>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            {t('library.addToLibrary')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
