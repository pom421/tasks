// Import du fichier markdown historique.
//
// Format attendu (tolérant) :
//
//   - Projet A
//     - tâche à faire
//   - Projet B
//     - [ ] autre tâche
//
//   ## 2026-09-24            <- toute ligne contenant une date ouvre une zone "faites"
//   - Projet A
//     - tâche faite ce jour
//   - [x] tâche sans projet (rangée dans "Sans projet")
//
// Dates reconnues : 2026-09-24, 24/09/2026, 24-09-2026, 24.09.2026.

const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const CHECKBOX_RE = /^\[[ xX]\]\s*/;
const ISO_RE = /(\d{4})-(\d{2})-(\d{2})/;
const FR_RE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/;
export const NO_PROJECT = 'Sans projet';

// title null = projet seul (sans tâche) ; doneAt null = tâche à faire.
export interface ImportItem {
  project: string;
  title: string | null;
  doneAt: string | null;
}

function findDate(text: string): string | null {
  let m = text.match(ISO_RE);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(FR_RE);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function clean(text: string): string {
  return text.replace(CHECKBOX_RE, '').replace(/\*\*|__/g, '').trim();
}

export function parseMarkdown(md: string): ImportItem[] {
  const lines = md.replace(/\t/g, '  ').split(/\r?\n/);
  const items: ImportItem[] = [];
  let doneAt: string | null = null; // null tant qu'on est dans la zone "à faire"
  let project: string | null = null; // projet courant (puce de niveau 0)
  let pendingTop: string | null = null; // puce de niveau 0 pas encore classée projet/tâche

  const flushTop = () => {
    // Une puce de niveau 0 sans sous-puces : projet vide (zone à faire) ou tâche sans projet (zone faite).
    if (pendingTop && doneAt) items.push({ project: NO_PROJECT, title: pendingTop, doneAt });
    else if (pendingTop) items.push({ project: pendingTop, title: null, doneAt: null });
    pendingTop = null;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const bullet = line.match(BULLET_RE);

    if (!bullet) {
      const date = findDate(line);
      if (date) {
        flushTop();
        doneAt = date;
        project = null;
      }
      continue;
    }

    const indent = bullet[1].length;
    const text = clean(bullet[2]);
    if (!text) continue;

    // Puce de niveau 0 qui n'est qu'une date ("- 24/09/2026") : en-tête de journée.
    if (indent === 0 && findDate(text) && !text.replace(ISO_RE, '').replace(FR_RE, '').replace(/[\W_]/g, '')) {
      flushTop();
      doneAt = findDate(text);
      project = null;
      continue;
    }

    if (indent === 0) {
      flushTop();
      project = text;
      pendingTop = text;
    } else {
      pendingTop = null;
      items.push({ project: project ?? NO_PROJECT, title: text, doneAt });
    }
  }
  flushTop();

  // Les projets vides (title null) sont gardés pour créer le projet, sans tâche.
  return items;
}
