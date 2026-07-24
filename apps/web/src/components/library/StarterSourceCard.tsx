import { AudioOutlined, GlobalOutlined } from '@ant-design/icons';
import { Button, Card, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogSource } from '../../api/catalog';
import { getYoutubeCoverImageFallback } from '../../utils/youtube';

const { Text } = Typography;

interface StarterSourceCardProps {
  source: CatalogSource;
  onSave: (source: CatalogSource) => Promise<void>;
}

function YouTubeLogo() {
  return (
    <span className="inline-flex items-center gap-1" style={{ verticalAlign: 'middle' }}>
      <svg viewBox="0 0 18 15" width="18" height="15" aria-hidden="true">
        <path d="M17.6 3.2A2.3 2.3 0 0 0 15.9 1.5C14.5 1 9 1 9 1S3.5 1 2.1 1.5A2.3 2.3 0 0 0 .4 3.2C0 4.6 0 7.5 0 7.5s0 2.9.4 4.3c.2.9.9 1.5 1.7 1.7C3.5 14 9 14 9 14s5.5 0 6.9-.5c.9-.2 1.5-.8 1.7-1.7C18 10.4 18 7.5 18 7.5s0-2.9-.4-4.3z" fill="#FF0000" />
        <path d="M7 10.5V4.5l5.5 3-5.5 3z" fill="white" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: '0.8em', letterSpacing: '-0.2px', lineHeight: 1 }}>YouTube</span>
    </span>
  );
}

function StarterTypeTag({ type }: { type: CatalogSource['type'] }) {
  if (type === 'youtube_videos') {
    return <YouTubeLogo />;
  }
  if (type === 'podcast_feeds') {
    return <Tag icon={<AudioOutlined />} color="purple" className="m-0 shadow-sm">Podcast</Tag>;
  }
  return <Tag icon={<GlobalOutlined />} className="m-0 shadow-sm">Web</Tag>;
}

export function StarterSourceCard({ source, onSave }: StarterSourceCardProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const coverImageUrl = source.coverImageUrl ?? (source.type === 'youtube_videos' ? getYoutubeCoverImageFallback(source.value) : null);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(source);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      size="small"
      className="flex h-full min-h-[170px] flex-col overflow-hidden border border-[rgba(114,46,209,0.18)] shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[rgba(114,46,209,0.38)] hover:shadow-md dark:border-[rgba(167,139,250,0.30)] dark:hover:border-[rgba(167,139,250,0.55)]"
      styles={{ body: { display: 'flex', flexDirection: 'column', flex: 1, padding: 0 } }}
    >
      <div className="relative h-44 overflow-hidden bg-slate-900">
        {coverImageUrl ? (
          <>
            <img
              aria-hidden
              src={coverImageUrl}
              className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] object-cover blur-xl opacity-60"
            />
            <img
              src={coverImageUrl}
              alt={`${source.title} cover`}
              className="relative h-full w-full object-contain"
            />
          </>
        ) : (
          source.type === 'youtube_videos' ? (
            <div className="flex h-full items-center justify-center bg-slate-900/80 text-slate-100">
              <YouTubeLogo />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-300">
              {t('library.coverUnavailable')}
            </div>
          )
        )}
        <div className="absolute left-3 top-3 rounded-lg bg-black/55 px-2 py-1 shadow-sm backdrop-blur-[1px]">
          <StarterTypeTag type={source.type} />
        </div>
        <div className="absolute right-3 top-3">
          <Tag color="blue" className="m-0 shadow-sm">{t('library.starterPicks')}</Tag>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="min-w-0">
          <div className="text-base font-semibold leading-snug text-foreground">{source.title}</div>
          <Text type="secondary" className="mt-1 line-clamp-2 block text-xs">
            {source.summary}
          </Text>
        </div>
        <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 text-[11px] text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/30 dark:text-violet-200">
          {t('library.curatedForYou')}
        </div>
        <div className="mt-4">
          <Button type="primary" block loading={saving} onClick={() => void handleSave()}>
            {t('library.addToLibrary')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
