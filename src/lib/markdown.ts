import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Les liens des notes s'ouvrent dans un nouvel onglet, sans accès à l'app ;
// sauf les liens vers une tâche (#tache-12, synthèse), ouverts dans l'app.
export const TASK_LINK = /^#tache-(\d+)$/;
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && !TASK_LINK.test(node.getAttribute('href') ?? '')) {
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
