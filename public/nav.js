// Navigation clavier : un seul élément « courant » à la fois (roving focus).
//
// Chaque étape porte data-nav et une clé stable data-nav-key ("project:3",
// "task:12", "add:3", "new-project"). La clé permet de retrouver l'élément
// après un re-rendu complet de la liste.

const ITEM = '[data-nav]';

export function navItems() {
  // offsetParent null = élément masqué (projet archivé non affiché, etc.).
  return [...document.querySelectorAll(ITEM)].filter((el) => el.offsetParent !== null);
}

function focusItem(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}

// Déplace le focus de delta éléments, ou au début / à la fin.
export function move(delta) {
  const items = navItems();
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  let next;
  if (delta === -Infinity) next = 0;
  else if (delta === Infinity) next = items.length - 1;
  else if (i === -1) next = delta > 0 ? 0 : items.length - 1;
  else next = Math.min(Math.max(i + delta, 0), items.length - 1);
  focusItem(items[next]);
}

export function focusByKey(key) {
  focusItem(navItems().find((item) => item.dataset.navKey === key));
}

// Photographie du focus avant un re-rendu : clé, position et saisie en cours.
export function snapshot() {
  const el = document.activeElement;
  const key = el?.dataset?.navKey;
  if (!key) return null;
  const items = navItems();
  const index = items.findIndex((item) => item.dataset.navKey === key);
  return { key, index, draft: el.classList.contains('add') ? el.value : '' };
}

// stay = true : garder la même position plutôt que suivre l'élément
// (ex. une tâche cochée part dans le journal, le focus reste dans la liste).
export function restore(snap, { stay = false } = {}) {
  if (!snap) return;
  const items = navItems();
  if (!items.length) return;
  let el = stay ? null : items.find((item) => item.dataset.navKey === snap.key);
  el ??= items[Math.min(Math.max(snap.index, 0), items.length - 1)];
  if (snap.draft && el.dataset.navKey === snap.key) el.value = snap.draft;
  focusItem(el);
}

// Éléments où ↑/↓ ont déjà un sens (listes, dates, édition) : on n'y touche pas.
function ownsArrows(el) {
  return el.matches('input.edit, select, textarea, input[type="date"]');
}

export function installNav() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]') || ownsArrows(e.target)) return;
    const moves = { ArrowDown: 1, ArrowUp: -1 };
    // Début/fin : seulement hors champ texte, où ces touches déplacent le curseur.
    if (!e.target.matches('input')) Object.assign(moves, { Home: -Infinity, End: Infinity });
    if (e.key in moves) {
      e.preventDefault();
      move(moves[e.key]);
    }
  });
}
