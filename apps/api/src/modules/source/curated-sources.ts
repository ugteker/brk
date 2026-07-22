import type { SourceType } from './types';

export interface CuratedSource {
  type: Extract<SourceType, 'podcast_feeds' | 'youtube_videos'>;
  value: string;
  title: string;
  author?: string;
  coverImageUrl: string | null;
}

/**
 * Static curated finance sources shown as onboarding suggestions when the marketplace has no
 * (or few) publications. Cover images are intentionally null - the frontend renders its own
 * placeholder and the real cover is fetched during probeSource before the source is added.
 */
export const CURATED_SOURCES: CuratedSource[] = [
  {
    type: 'podcast_feeds',
    value: 'https://alles-auf-aktien.podigee.io/feed/mp3',
    title: 'Alles auf Aktien',
    author: 'WELT',
    coverImageUrl: null
  },
  {
    type: 'podcast_feeds',
    value: 'https://ohne-aktien-wird-schwer.podigee.io/feed/mp3',
    title: 'OHNE AKTIEN WIRD SCHWER',
    author: 'Noah Leidinger, OMR',
    coverImageUrl: null
  },
  {
    type: 'podcast_feeds',
    value: 'https://handelsblatt-today.podigee.io/feed/mp3',
    title: 'Handelsblatt Today',
    author: 'Handelsblatt',
    coverImageUrl: null
  },
  {
    type: 'podcast_feeds',
    value: 'https://doppelgaenger.podigee.io/feed/mp3',
    title: 'Doppelgänger Tech Talk',
    author: 'Philipp Glöckler, Philipp Klöckner',
    coverImageUrl: null
  },
  {
    type: 'podcast_feeds',
    value: 'https://feeds.megaphone.fm/BLM2098700642',
    title: 'Odd Lots',
    author: 'Bloomberg',
    coverImageUrl: null
  },
  {
    type: 'youtube_videos',
    value: 'https://www.youtube.com/@Finanzfluss',
    title: 'Finanzfluss',
    coverImageUrl: null
  },
  {
    type: 'youtube_videos',
    value: 'https://www.youtube.com/@echtgeldtv',
    title: 'Echtgeld.TV',
    coverImageUrl: null
  },
  {
    type: 'youtube_videos',
    value: 'https://www.youtube.com/@markets',
    title: 'Bloomberg Television',
    coverImageUrl: null
  }
];
