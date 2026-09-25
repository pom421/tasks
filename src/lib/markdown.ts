import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Les liens des notes s'ouvrent dans un nouvel onglet, sans accès à l'app.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Markdown (GFM) -> HTML assaini : DOMPurify retire scripts, gestionnaires
// d'événements et liens « javascript: » avant l'insertion dans la page.
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { gfm: true, breaks: true, async: false });
  return DOMPurify.sanitize(html);
}
