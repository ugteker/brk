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
 * (or few) publications. Podcast cover images are static artwork URLs (Apple Podcasts CDN) so the
 * suggestion list shows real covers immediately; YouTube channel avatars cannot be resolved
 * statically, so those stay null and the frontend renders a placeholder. The live cover is
 * (re)fetched during probeSource before the source is added.
 */
export const CURATED_SOURCES: CuratedSource[] = [
  {
    type: 'podcast_feeds',
    value: 'https://alles-auf-aktien.podigee.io/feed/mp3',
    title: 'Alles auf Aktien',
    author: 'WELT',
    coverImageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/b2/58/51/b25851aa-8d3c-e07c-32ca-6448fd13ae58/mza_17262563778469826471.jpg/600x600bb.jpg'
  },
  {
    type: 'podcast_feeds',
    value: 'https://ohne-aktien-wird-schwer.podigee.io/feed/mp3',
    title: 'OHNE AKTIEN WIRD SCHWER',
    author: 'Noah Leidinger, OMR',
    coverImageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/bf/3f/1c/bf3f1c1d-8e0e-a3bc-557d-5a19cc277564/mza_14204900448065376176.jpg/600x600bb.jpg'
  },
  {
    type: 'podcast_feeds',
    value: 'https://handelsblatt-today.podigee.io/feed/mp3',
    title: 'Handelsblatt Today',
    author: 'Handelsblatt',
    coverImageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/a1/ba/0d/a1ba0de5-4498-f430-b4c9-1ba3eab6afa7/mza_6549718415882804995.jpg/600x600bb.jpg'
  },
  {
    type: 'podcast_feeds',
    value: 'https://doppelgaenger.podigee.io/feed/mp3',
    title: 'Doppelgänger Tech Talk',
    author: 'Philipp Glöckler, Philipp Klöckner',
    coverImageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/75/93/3f/75933f21-c6cd-2b72-0caf-fa2c0781859e/mza_17697899847819050356.jpg/600x600bb.jpg'
  },
  {
    type: 'podcast_feeds',
    value: 'https://feeds.megaphone.fm/BLM2098700642',
    title: 'Odd Lots',
    author: 'Bloomberg',
    coverImageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/f3/99/6a/f3996a52-e4a4-bf0d-b7d6-e376c4058568/mza_15550359494736224565.jpg/600x600bb.jpg'
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
