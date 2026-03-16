import DOMPurify from 'dompurify';

// Allow SVG elements and attributes needed for icon display
const PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['use'],
  ADD_ATTR: ['xlink:href', 'xml:space'],
};

// LRU cache for sanitized SVG — avoids re-running DOMPurify on unchanged content
const CACHE_MAX = 16384;
const sanitizeCache = new Map<string, string>();

export function sanitizeSVG(html: string | null | undefined): string {
  if (!html) return '';

  const cached = sanitizeCache.get(html);
  if (cached !== undefined) return cached;

  const result = DOMPurify.sanitize(html, PURIFY_CONFIG);

  // Evict oldest entries when cache is full
  if (sanitizeCache.size >= CACHE_MAX) {
    const firstKey = sanitizeCache.keys().next().value;
    if (firstKey !== undefined) sanitizeCache.delete(firstKey);
  }

  sanitizeCache.set(html, result);
  return result;
}

/** Clear sanitize cache (e.g. after icon content changes) */
export function clearSanitizeCache(): void {
  sanitizeCache.clear();
}
