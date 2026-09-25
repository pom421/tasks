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
  el.scrollIntoView({ block: 'nearest' });
}

export function focusByKey(key: string) {
  focusItem(navItems().find((item) => item.dataset.navKey === key));
}

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
  focusItem(items[next]);
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
  const el = (!stay && items.find((item) => item.dataset.navKey === snap.key)) || items[Math.min(Math.max(snap.index, 0), items.length - 1)];
  focusItem(el);
}

// Éléments où ↑/↓ ont déjà un sens (listes, dates, édition) : on n'y touche pas.
function ownsArrows(el: Element) {
  return el.matches('input.edit, select, textarea, input[type="date"]');
}

export function handleNavKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (document.querySelector('[role="dialog"]') || ownsArrows(e.target as Element)) return;
  const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
  // Début/fin : seulement hors champ texte, où ces touches déplacent le curseur.
  if (!(e.target as Element).matches('input')) Object.assign(moves, { Home: -Infinity, End: Infinity });
  if (e.key in moves) {
    e.preventDefault();
    move(moves[e.key]);
  }
}
