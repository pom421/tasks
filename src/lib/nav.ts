// Navigation clavier : un seul élément « courant » à la fois (roving focus).
//
// Chaque étape porte data-nav et une clé stable data-nav-key ("project:3",
// "task:12", "add:3", "new-project"). La clé permet de retrouver l'élément
// après un re-rendu de la liste.

export interface FocusSnapshot {
  key: string;
  index: number;
}

export function navItems(): HTMLElement[] {
  // offsetParent null = élément masqué.
  return [...document.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => el.offsetParent !== null);
}

function focusItem(el: HTMLElement | undefined) {
  if (!el) return;
  el.focus({ preventScroll: true });
  // Premier élément : haut de page, pour garder l'en-tête (titre, filtres) visible.
  if (el === navItems()[0]) window.scrollTo({ top: 0 });
  else el.scrollIntoView({ block: 'nearest' });
}

// false si l'élément n'est pas affiché (ex. tâche dont la création est annulée).
export function focusByKey(key: string): boolean {
  const el = navItems().find((item) => item.dataset.navKey === key);
  focusItem(el);
  return Boolean(el);
}

// Focus donné par la navigation (↑/↓, j/k, gg/G, Début/Fin) : un champ
// « + Ajouter » atteint ainsi reste en lecture (Entrée pour écrire).
let byNav = false;
export const focusedByNav = () => byNav;

// Déplace le focus de delta éléments, ou au début / à la fin (±Infinity).
export function move(delta: number) {
  const items = navItems();
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (delta === -Infinity) next = 0;
  else if (delta === Infinity) next = items.length - 1;
  else if (i === -1) next = delta > 0 ? 0 : items.length - 1;
  else next = Math.min(Math.max(i + delta, 0), items.length - 1);
  byNav = true;
  focusItem(items[next]);
  byNav = false;
}

// Photographie du focus avant un re-rendu : clé et position.
export function snapshot(): FocusSnapshot | null {
  const key = (document.activeElement as HTMLElement | null)?.dataset?.navKey;
  if (!key) return null;
  return { key, index: navItems().findIndex((item) => item.dataset.navKey === key) };
}

// stay = true : garder la même position plutôt que suivre l'élément
// (ex. une tâche cochée part dans le journal, le focus reste dans la liste).
export function restore(snap: FocusSnapshot | null, { stay = false } = {}) {
  if (!snap) return;
  const items = navItems();
  if (!items.length) return;
  if (!stay) {
    const same = items.find((item) => item.dataset.navKey === snap.key);
    if (same) return focusItem(same);
  }
  // Même position ; si c'est un champ de saisie (« + Ajouter »), on remonte à
  // l'élément précédent : les raccourcis (u, x…) restent utilisables.
  let i = Math.min(Math.max(snap.index, 0), items.length - 1);
  while (i > 0 && items[i].matches('input')) i--;
  focusItem(items[i]);
}

// Champ de saisie où l'on écrit (un champ « + Ajouter » en lecture n'en est pas un).
export const TEXT_FIELD = 'input:not([type="checkbox"]):not([readonly]), textarea';

// Éléments où ↑/↓ ont déjà un sens (listes, dates, édition) : on n'y touche pas.
function ownsArrows(el: Element) {
  return el.matches('input.edit, select, textarea, input[type="date"]');
}

// Instant du dernier g seul : un 2e g rapproché (gg) va au premier élément.
let lastG = 0;

// Maj+↑ / Maj+↓ : en-tête du projet précédent / suivant (depuis un projet, une
// de ses tâches ou son champ d'ajout ; hors projet : dernier / premier).
function moveProject(delta: -1 | 1) {
  const heads = navItems().filter((item) => item.dataset.navKey?.startsWith('project:'));
  const here = document.activeElement?.closest('.project')?.querySelector<HTMLElement>('[data-nav-key^="project:"]');
  const i = here ? heads.indexOf(here) : delta > 0 ? -1 : heads.length;
  focusItem(heads[Math.min(Math.max(i + delta, 0), heads.length - 1)]);
}

export function handleNavKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as Element;
  if (document.querySelector('[role="dialog"]') || ownsArrows(target)) return;
  if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    // Dans un champ texte, Maj+flèche sélectionne : on n'y touche pas.
    if (target.matches(TEXT_FIELD)) return;
    e.preventDefault();
    moveProject(e.key === 'ArrowUp' ? -1 : 1);
    return;
  }
  if (e.shiftKey && e.key !== 'G') return;
  const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
  // Hors champ texte seulement (où ces touches servent à écrire ou déplacer
  // le curseur) : Début / Fin, et à la manière de vim j / k, gg / G.
  if (!target.matches(TEXT_FIELD)) {
    Object.assign(moves, { Home: -Infinity, End: Infinity, j: 1, k: -1, G: Infinity });
    if (e.key === 'g') {
      e.preventDefault();
      const now = Date.now();
      if (now - lastG < 800) {
        lastG = 0;
        move(-Infinity);
      } else lastG = now;
      return;
    }
  }
  if (e.key in moves) {
    e.preventDefault();
    move(moves[e.key]);
  }
}

// Touches de déplacement (Alt+↑/↓ ou Alt+k/j). e.code : sur macOS, Alt+j produit « ∆ » dans e.key.
export function moveDirection(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string; target: EventTarget | null }): -1 | 1 | undefined {
  if (!e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).matches('input, textarea')) return undefined;
  return ({ ArrowUp: -1, KeyK: -1, ArrowDown: 1, KeyJ: 1 } as Record<string, -1 | 1>)[e.code];
}
