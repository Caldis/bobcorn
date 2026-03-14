import DOMPurify from 'dompurify';

// Allow SVG elements and attributes needed for icon display
const PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['use'],
  ADD_ATTR: ['xlink:href', 'xml:space'],
};

export function sanitizeSVG(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
