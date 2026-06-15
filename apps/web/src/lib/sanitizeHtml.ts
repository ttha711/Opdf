import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML coming from AI responses, converted documents, or any
 * other external source before it is injected into the DOM.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
