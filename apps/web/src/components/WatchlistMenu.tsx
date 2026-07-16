import { useEffect, useState } from 'react';
import { Button, Empty, Popover, Spin, Tag, message } from 'antd';
import { StarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { listWatchlist, removeFromWatchlist, type WatchlistEntryDto } from '../api/watchlist';
import { TouchSafeTooltip } from './TouchSafeTooltip';

/**
 * Header star button opening the user's personal watchlist: every followed symbol with a
 * remove control. Following happens from report signal tags (star on each tag); whenever a
 * followed symbol appears in any new report, the user gets an email alert.
 */
export function WatchlistMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<WatchlistEntryDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listWatchlist()
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => {
        if (!cancelled) message.error(t('watchlist.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  async function onRemove(symbol: string) {
    try {
      await removeFromWatchlist(symbol);
      setEntries((prev) => prev.filter((entry) => entry.symbol !== symbol));
    } catch {
      message.error(t('watchlist.removeFailed'));
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      title={t('watchlist.title')}
      content={
        <div style={{ maxWidth: 280 }}>
          {loading ? (
            <div className="py-2 text-center">
              <Spin size="small" />
            </div>
          ) : entries.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('watchlist.empty')} />
          ) : (
            <div className="flex flex-wrap gap-1">
              {entries.map((entry) => (
                <Tag key={entry.symbol} closable onClose={() => void onRemove(entry.symbol)}>
                  {entry.symbol}
                </Tag>
              ))}
            </div>
          )}
          <p className="mb-0 mt-2 text-[11px] text-gray-400">{t('watchlist.hint')}</p>
        </div>
      }
    >
      <TouchSafeTooltip title={t('watchlist.title')}>
        <Button shape="circle" icon={<StarOutlined />} aria-label={t('watchlist.title')} />
      </TouchSafeTooltip>
    </Popover>
  );
}
