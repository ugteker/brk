import { describe, expect, it } from 'vitest';
import { isFeedDocument } from './feed-detection';

describe('isFeedDocument', () => {
  it('detects RSS 2.0 documents', () => {
    expect(isFeedDocument('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>')).toBe(true);
  });

  it('detects Atom documents', () => {
    expect(isFeedDocument('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toBe(true);
  });

  it('detects RDF-based feeds', () => {
    expect(isFeedDocument('<?xml version="1.0"?><rdf:RDF xmlns:rdf="x"></rdf:RDF>')).toBe(true);
  });

  it('returns false for a plain HTML page', () => {
    expect(isFeedDocument('<!DOCTYPE html><html><body><h1>Hello</h1></body></html>')).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(isFeedDocument('')).toBe(false);
  });
});
