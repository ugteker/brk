// Test setup for jsdom environment. Ant Design's responsive utilities call
// window.matchMedia, which jsdom does not implement — polyfill it here.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  }) as unknown as MediaQueryList;
}

// Ant Design relies on getComputedStyle for measurements; jsdom sometimes
// doesn't implement it. Provide a minimal stub used by rc-component's
// getScrollBarSize and other layout utilities.
if (typeof window !== 'undefined') {
  // Force a harmless stub for getComputedStyle so rc-component/antd's
  // measurement utilities don't call jsdom's unimplemented helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).getComputedStyle = (elt: Element, pseudo?: string) => {
    return {
      getPropertyValue: (prop: string) => '',
      width: '0px',
      height: '0px'
    } as any;
  };
}

// Ant Design's auto-sizing TextArea observes element resize via ResizeObserver,
// which jsdom does not implement either.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).ResizeObserver = ResizeObserverStub;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverStub;
}

// Initialize i18next with English translations so t() calls resolve to real strings in tests.
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './i18n/locales/en.json';

if (!i18next.isInitialized) {
  i18next
    .use(initReactI18next)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en } },
      ns: ['translation'],
      defaultNS: 'translation',
      interpolation: { escapeValue: false }
    });
}
