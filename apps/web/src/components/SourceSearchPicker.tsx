import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Input, Spin, Tag } from 'antd';
import { LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  listSourceSuggestions,
  searchSources,
  type SourceSearchResultItem,
  type SourceSuggestion,
  type SourceType
} from '../api/sources';

export interface SourcePickerSelection {
  type: SourceType;
  value: string;
  title?: string;
  coverImageUrl?: string | null;
}

interface SourceSearchPickerProps {
  /** Called when the user picks a search result or suggestion. The caller is expected to
   * run probeSource (preview items) and createSource, exactly like the URL flow. */
  onSelect: (selection: SourcePickerSelection) => void;
  /** Currently selected source value - highlights the matching card. */
  selectedValue?: string | null;
  /** The existing URL-input UI, revealed by the "paste a URL instead" fallback link. */
  urlFallback?: ReactNode;
}

interface DisplayItem {
  type: SourceType;
  value: string;
  title: string;
  author?: string;
  coverImageUrl: string | null;
}

const SEARCH_DEBOUNCE_MS = 400;

function typeTag(type: SourceType, t: (key: string) => string) {
  if (type === 'podcast_feeds') return <Tag color="purple" className="m-0">{t('source.type.podcast')}</Tag>;
  if (type === 'youtube_videos') return <Tag color="red" className="m-0">{t('source.type.youtube')}</Tag>;
  return <Tag className="m-0">{t('source.type.web')}</Tag>;
}

function ResultCard({
  item,
  selected,
  onPick,
  t
}: {
  item: DisplayItem;
  selected: boolean;
  onPick: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick();
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 text-left transition-all !bg-card ${
        selected ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'
      }`}
    >
      {item.coverImageUrl ? (
        <img src={item.coverImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover shadow-sm" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed text-lg text-gray-400">
          {item.type === 'youtube_videos' ? '▶' : '🎙'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-semibold text-foreground">{item.title}</p>
        {item.author ? <p className="m-0 truncate text-xs text-muted-foreground">{item.author}</p> : null}
      </div>
      {typeTag(item.type, t)}
    </div>
  );
}

export function SourceSearchPicker({ onSelect, selectedValue, urlFallback }: SourceSearchPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SourceSearchResultItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchNonceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listSourceSuggestions()
      .then((items) => {
        if (!cancelled) setSuggestions(items);
      })
      .catch(() => {
        // Suggestions are best-effort onboarding sugar - a failure just hides the section.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function runSearch(term: string) {
    const nonce = ++searchNonceRef.current;
    setIsSearching(true);
    setSearchFailed(false);
    try {
      const response = await searchSources(term);
      if (searchNonceRef.current !== nonce) return; // stale - a newer query took over
      setResults(response.results);
      setWarnings(response.warnings);
    } catch {
      if (searchNonceRef.current !== nonce) return;
      setResults([]);
      setWarnings([]);
      setSearchFailed(true);
    } finally {
      if (searchNonceRef.current === nonce) setIsSearching(false);
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = value.trim();
    if (!term) {
      searchNonceRef.current += 1; // invalidate in-flight searches
      setResults(null);
      setWarnings([]);
      setSearchFailed(false);
      setIsSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(term);
    }, SEARCH_DEBOUNCE_MS);
  }

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-3">
      <Input
        size="large"
        aria-label={t('sourcePicker.searchPlaceholder')}
        placeholder={t('sourcePicker.searchPlaceholder')}
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        prefix={<SearchOutlined />}
        suffix={isSearching ? <Spin size="small" /> : null}
        allowClear
      />

      {hasQuery ? (
        <div className="space-y-2">
          {searchFailed ? (
            <Alert type="error" showIcon message={t('sourcePicker.searchError')} />
          ) : results !== null && !isSearching && results.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('sourcePicker.noResults')}</p>
          ) : null}
          {!searchFailed && warnings.length > 0 && results !== null && (
            <Alert type="warning" showIcon message={t('sourcePicker.partialResults')} />
          )}
          <div
            className="max-h-[min(22rem,calc(100vh-24rem))] space-y-2 overflow-y-auto overscroll-contain pr-1"
            aria-live="polite"
          >
            {(results ?? []).map((item) => (
              <ResultCard
                key={`${item.type}:${item.value}`}
                item={item}
                selected={selectedValue === item.value}
                onPick={() => onSelect({ type: item.type, value: item.value, title: item.title, coverImageUrl: item.coverImageUrl })}
                t={t}
              />
            ))}
          </div>
        </div>
      ) : suggestions.length > 0 ? (
        <div className="space-y-2">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('sourcePicker.popularSources')}</p>
          <div
            className="max-h-[min(22rem,calc(100vh-24rem))] space-y-2 overflow-y-auto overscroll-contain pr-1"
            aria-live="polite"
          >
            {suggestions.slice(0, 6).map((item) => (
              <ResultCard
                key={`${item.origin}:${item.value}`}
                item={item}
                selected={selectedValue === item.value}
                onPick={() => onSelect({ type: item.type, value: item.value, title: item.title, coverImageUrl: item.coverImageUrl })}
                t={t}
              />
            ))}
          </div>
        </div>
      ) : null}

      {urlFallback ? (
        showUrlInput ? (
          <div className="space-y-2 border-t border-border pt-3">{urlFallback}</div>
        ) : (
          <button
            type="button"
            onClick={() => setShowUrlInput(true)}
            className="flex items-center gap-1 border-0 bg-transparent p-0 text-xs text-muted-foreground underline-offset-2 hover:underline cursor-pointer"
          >
            <LinkOutlined /> {t('sourcePicker.useUrlInstead')}
          </button>
        )
      ) : null}
    </div>
  );
}
