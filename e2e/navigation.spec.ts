import type { Locator, Page } from '@playwright/test';
import type { Store } from '../server/db.ts';
import { test as base, expect } from './fixtures.ts';

// Deux projets : Alpha (Une, Deux) et Beta (Trois).
function seed(store: Store) {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  const tasks = {
    une: store.createTask(alpha.id, 'Une'),
    deux: store.createTask(alpha.id, 'Deux'),
    trois: store.createTask(beta.id, 'Trois'),
  };
  return { alpha, beta, tasks };
}

// Clé de navigation de l'élément qui a le focus ("project:1", "task:2"…).
const current = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.navKey ?? null);

// Recharge la page et attend la liste : sinon les touches partent trop tôt.
async function reload(page: Page) {
  await page.reload();
  await expect(page.locator('.project').first()).toBeVisible();
}

async function pressDown(page: Page, n: number) {
  for (let i = 0; i < n; i++) await page.keyboard.press('ArrowDown');
}

// `data` : jeu de données créé en base, page ouverte dessus. Automatique :
// chaque test de ce fichier part de cet état, même sans demander `data`.
const test = base.extend<{ data: ReturnType<typeof seed> }>({
  data: [
    async ({ page, store }, use) => {
      const data = seed(store);
      await page.goto('/');
      await expect(page.locator('.project')).toHaveCount(2);
      await use(data);
    },
    { auto: true },
  ],
});

test('↑/↓ parcourent projets, tâches et champs d’ajout ; Début/Fin', async ({ page, data }) => {
  const { alpha, beta, tasks } = data;
  const expected = [
    `project:${alpha.id}`, `task:${tasks.une.id}`, `task:${tasks.deux.id}`, `add:${alpha.id}`,
    `project:${beta.id}`, `task:${tasks.trois.id}`, `add:${beta.id}`, 'new-project',
  ];
  for (const key of expected) {
    await page.keyboard.press('ArrowDown');
    expect(await current(page)).toBe(key);
  }
  // Bas de liste : on reste sur le dernier élément.
  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe('new-project');

  for (const key of expected.slice(0, -1).reverse()) {
    await page.keyboard.press('ArrowUp');
    expect(await current(page)).toBe(key);
  }

  // Début / Fin depuis un nom (dans un champ, ces touches déplacent le curseur).
  await page.keyboard.press('End');
  expect(await current(page)).toBe('new-project');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await current(page)).toBe(`task:${tasks.trois.id}`);
  await page.keyboard.press('Home');
  expect(await current(page)).toBe(`project:${alpha.id}`);
});

test('gg / G à la manière de vim : premier / dernier élément ; un seul g ne fait rien', async ({ page, data }) => {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »
  await page.keyboard.press('G');
  expect(await current(page)).toBe('new-project');
  await page.keyboard.press('ArrowUp'); // champ d'ajout de Beta
  await page.keyboard.press('ArrowUp'); // « Trois » (hors champ : g navigue)
  await page.keyboard.press('g');
  expect(await current(page)).toBe(`task:${data.tasks.trois.id}`);
  await page.keyboard.press('g');
  expect(await current(page)).toBe(`project:${data.alpha.id}`);

  // Dans un champ de saisie, g et G s'écrivent.
  await page.keyboard.press('n');
  await page.keyboard.type('ggG');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('ggG');
});

test('Entrée sur un projet : édition, Entrée enregistre et rend la navigation', async ({ page, store, data }) => {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const input = page.locator('input.edit');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Alpha');

  await page.keyboard.type('Alpha renommé');
  await page.keyboard.press('Enter');

  await expect(page.locator('.project-head .name').first()).toHaveText('Alpha renommé');
  expect(store.state().projects[0].name).toBe('Alpha renommé');
  expect(await current(page)).toBe(`project:${data.alpha.id}`);

  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
});

test('Entrée sur une tâche puis Échap : annule, focus sur la tâche, navigation reprend', async ({ page, store, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press('Enter');
  const input = page.locator('input.edit');
  await expect(input).toHaveValue('Une');

  // En édition, ↑/↓ ne quittent pas le champ.
  await page.keyboard.press('ArrowDown');
  await expect(input).toBeFocused();

  await page.keyboard.type('modifié');
  await page.keyboard.press('Escape');

  await expect(input).toHaveCount(0);
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
  expect(store.state().projects[0].tasks[0].title).toBe('Une');

  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('Entrée sur une tâche : modification enregistrée', async ({ page, store, data }) => {
  await pressDown(page, 3);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Deux bis');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Deux bis' })).toBeVisible();
  expect(store.state().projects[0].tasks[1].title).toBe('Deux bis');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('Espace coche la tâche ; le focus reste à la même place', async ({ page, store, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press(' ');
  await expect(page.locator('#projects .name', { hasText: 'Une' })).toHaveCount(0);
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Deux']);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
  await page.keyboard.press('L'); // onglet Log
  await expect(page.locator('#journal .name', { hasText: 'Une' })).toBeVisible();
});

test('Espace dans le journal décoche la tâche', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-25' });
  await page.goto('/log');
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toBeVisible();
  await page.keyboard.press('End');
  expect(await current(page)).toBe(`task:${data.tasks.trois.id}`);
  await page.keyboard.press(' ');
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toHaveCount(0);
  await page.keyboard.press('P'); // onglet Projets
  await expect(page.locator('#projects .name', { hasText: 'Trois' })).toBeVisible();
  expect(store.state().projects[1].tasks[0].title).toBe('Trois');
});

test('champ d’ajout : Entrée pour écrire, Entrée ajoute, Échap vide et repasse en lecture', async ({ page, store, data }) => {
  await pressDown(page, 4);
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await page.keyboard.press('Enter'); // atteint par la navigation : en lecture, Entrée pour écrire
  await page.keyboard.type('Quatre');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Quatre' })).toBeVisible();
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('');
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Une', 'Deux', 'Quatre']);

  await page.keyboard.type('brouillon');
  await page.keyboard.press('Escape');
  // Vidé, toujours sur le champ, en lecture : les touches naviguent (j, k)
  // et les raccourcis marchent (n n = nouveau projet).
  const add = page.locator(`[data-nav-key="add:${data.alpha.id}"]`);
  await expect(add).toHaveValue('');
  await expect(add).toHaveAttribute('readonly', '');
  await expect(add).toBeFocused();
  await page.keyboard.press('k');
  const quatre = store.state().projects[0].tasks[2].id;
  expect(await current(page)).toBe(`task:${quatre}`);
  await page.keyboard.press('j');
  await expect(add).toHaveAttribute('readonly', '');
  // Échap en lecture : rien de propre au champ, le curseur reste.
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await expect(page.locator('#new-project')).toBeFocused();
  await expect(page.locator('#new-project')).toHaveValue('');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('');
});

test('n : champ d’ajout du projet où est le curseur, pas du dernier utilisé', async ({ page, data }) => {
  // Alpha utilisé en dernier (champ d'ajout), puis curseur sur Beta.
  await page.locator(`[data-nav-key="add:${data.alpha.id}"]`).focus();
  await page.keyboard.press('Escape');
  await page.locator(`[data-nav-key="project:${data.beta.id}"]`).focus();
  await page.keyboard.press('n');
  await expect(page.locator(`[data-nav-key="add:${data.beta.id}"]`)).toBeFocused();

  // Depuis une tâche d'Alpha : le champ d'Alpha.
  await page.keyboard.press('Escape');
  await page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`).focus();
  await page.keyboard.press('n');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toBeFocused();

  // Hors projet (aucun élément courant) : le dernier projet utilisé, Alpha.
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('n');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toBeFocused();
});

test('x puis x supprime la tâche ; le focus passe à la suivante', async ({ page, store, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press('x');
  await expect(page.locator('.confirm-delete')).toBeVisible();
  expect(store.state().projects[0].tasks).toHaveLength(2); // pas encore supprimée
  await page.keyboard.press('x');
  await expect(page.locator('#projects .name', { hasText: /^Une$/ })).toHaveCount(0);
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Deux']);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('x puis Échap, ou x puis déplacement : suppression annulée', async ({ page, store }) => {
  await pressDown(page, 2);
  await page.keyboard.press('x');
  await page.keyboard.press('Escape');
  await expect(page.locator('.confirm-delete')).toHaveCount(0);
  await page.keyboard.press('x');
  await page.keyboard.press('j'); // descend sur « Deux »
  await page.keyboard.press('x'); // nouvelle demande, sur « Deux »
  await expect(page.locator('.confirm-delete')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Une', 'Deux']);
});

test('tâche : pas de bouton de suppression à la souris, seulement x x (ni fenêtre de confirmation)', async ({ page, data }) => {
  const une = page.locator(`li.task:has([data-nav-key="task:${data.tasks.une.id}"])`);
  await une.hover();
  await expect(une.getByRole('button', { name: /Supprimer|✕/ })).toHaveCount(0);
  await expect(une.getByText('✕')).toHaveCount(0);
});

test('ligne de tâche : icônes alignées à droite, clic n’importe où sur la ligne = édition puis flèches', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { bugtracker: 'wanted', notes: 'du contenu' });
  await reload(page);
  // Première ligne (le titre, porteur de data-nav-key, devient un champ en édition).
  const une = page.locator('#projects li.task').first();
  const box = async (sel: string) => (await une.locator(sel).boundingBox())!;
  const rowBox = (await une.boundingBox())!;
  // Icônes (report, détails, chrono, ☀ Aujourd’hui, puis priorité) collées au bord droit de la ligne.
  const details = await box('.details');
  const timer = await box('.timer');
  const sun = await box('.day-toggle');
  const priority = await box('button.priority');
  expect(rowBox.x + rowBox.width - (priority.x + priority.width)).toBeLessThan(10);
  expect(priority.x - (sun.x + sun.width)).toBeLessThan(10);
  expect(sun.x - (timer.x + timer.width)).toBeLessThan(10);
  expect(timer.x - (details.x + details.width)).toBeLessThan(10);
  // Report juste avant les emplacements fixes de l'échéance et du temps passé.
  const report = await box('.report');
  expect((await box('.due-slot')).x - (report.x + report.width)).toBeLessThan(10);

  // Clic à droite du texte, juste avant les icônes : le titre passe en édition.
  await page.mouse.click(report.x - 20, report.y + report.height / 2);
  await expect(une.locator('input.edit')).toBeFocused();
  await page.keyboard.press('Escape'); // retour au titre, curseur sur la tâche
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
  await page.keyboard.press('ArrowDown');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('remonter au premier projet : l’en-tête (titre, filtres, réglages) redevient visible', async ({ page, store, data }) => {
  for (let i = 0; i < 25; i++) store.createTask(data.beta.id, `Tâche ${i}`);
  await reload(page);
  await page.setViewportSize({ width: 800, height: 400 });
  await page.keyboard.press('End'); // tout en bas (champ « + Nouveau projet ») : l'en-tête sort de l'écran
  await page.keyboard.press('ArrowUp'); // hors champ de saisie : Début est une touche de navigation
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('heading', { name: 'Tâches', level: 1 })).not.toBeInViewport();
  await page.keyboard.press('Home'); // premier projet
  expect(await current(page)).toBe(`project:${data.alpha.id}`);
  await expect(page.getByRole('heading', { name: 'Tâches', level: 1 })).toBeInViewport();
  await expect(page.locator('#settings-link')).toBeInViewport();

  // Même chose en remontant pas à pas (↑).
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('heading', { name: 'Tâches', level: 1 })).not.toBeInViewport();
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp');
  expect(await current(page)).toBe(`project:${data.alpha.id}`);
  await expect(page.getByRole('heading', { name: 'Tâches', level: 1 })).toBeInViewport();
});

test('Suppr fonctionne comme x (double appui)', async ({ page, store }) => {
  await pressDown(page, 2);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await expect(page.locator('#projects .name', { hasText: /^Une$/ })).toHaveCount(0);
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Deux']);
});

test('j / k naviguent comme ↓ / ↑, y compris sur « + Ajouter » ; s’écrivent une fois en écriture (Entrée)', async ({ page, data }) => {
  await page.keyboard.press('j');
  expect(await current(page)).toBe(`project:${data.alpha.id}`);
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
  await page.keyboard.press('k');
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
  // Champ d'ajout atteint par j : en lecture, j / k continuent de naviguer.
  const add = page.locator(`[data-nav-key="add:${data.alpha.id}"]`);
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await expect(add).toHaveAttribute('readonly', '');
  await page.keyboard.press('k');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  expect(await current(page)).toBe(`project:${data.beta.id}`);
  await page.keyboard.press('k');
  await expect(add).toHaveValue('');
  // Entrée : en écriture, j et k sont des lettres.
  await page.keyboard.press('Enter');
  await expect(add).not.toHaveAttribute('readonly');
  await page.keyboard.type('jk');
  await expect(add).toHaveValue('jk');
});

test('« + Ajouter » : n ou clic = écriture directe ; n sur le champ en lecture le passe en écriture', async ({ page, data }) => {
  const add = page.locator(`[data-nav-key="add:${data.alpha.id}"]`);
  await add.click();
  await page.keyboard.type('x');
  await expect(add).toHaveValue('x');
  await page.keyboard.press('Escape'); // vidé, repasse en lecture
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await expect(add).toHaveAttribute('readonly', '');
  await pressDown(page, 1);
  await page.keyboard.press('k'); // retour sur « + Ajouter » par la navigation : lecture
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await expect(add).toHaveAttribute('readonly', '');
  await page.keyboard.press('n');
  await expect(add).not.toHaveAttribute('readonly');
  await expect(add).toBeFocused();
});

test('raccourcis actifs même quand le focus est sur la case à cocher', async ({ page, store }) => {
  await page.locator('#projects li.task').first().getByRole('checkbox').focus();
  await page.keyboard.press('r');
  await expect(page.locator('#projects li.task').first().locator('.report-wanted')).toBeVisible();
  expect(store.state().projects[0].tasks[0].bugtracker_wanted_at).toBeTruthy();
});

test('nouveau projet : le focus va sur la saisie de sa première tâche', async ({ page, store }) => {
  // p et N ne font rien (nouveau projet : n n) ; un seul n : champ d'ajout de tâche.
  await page.keyboard.press('p');
  await page.keyboard.press('N');
  await expect(page.locator('#new-project')).not.toBeFocused();
  await page.keyboard.press('n');
  await expect(page.locator('#projects input.add').first()).toBeFocused();
  await page.keyboard.press('n');
  await expect(page.locator('#new-project')).toBeFocused();
  await expect(page.locator('#projects input.add').first()).toHaveValue('');
  await page.keyboard.type('Gamma');
  await page.keyboard.press('Enter');
  await expect(page.locator('.project-head .name', { hasText: 'Gamma' })).toBeVisible();
  const gamma = store.state().projects.find((p) => p.name === 'Gamma')!;
  await expect(page.locator(`[data-nav-key="add:${gamma.id}"]`)).toBeFocused();

  await page.keyboard.type('Première tâche');
  await page.keyboard.press('Enter');
  await expect(page.locator(`#project-${gamma.id} .name`, { hasText: 'Première tâche' })).toBeVisible();
  expect(store.state().projects.find((p) => p.id === gamma.id)!.tasks.map((t) => t.title)).toEqual(['Première tâche']);
  await expect(page.locator(`[data-nav-key="add:${gamma.id}"]`)).toBeFocused();
});

test('J en édition : saisi comme une lettre, pas de bascule', async ({ page, store, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.type(' JJ');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Une JJ' })).toBeVisible();
  expect(store.state().projects[0].tasks[0].bugtracker_at).toBeNull();
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
});

test('badge « reporté » conservé dans le journal, et J y fonctionne aussi', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { bugtracker: 'done', bugtrackerKey: 'PROJ-3' });
  await reload(page);
  const row = page.locator(`li.task:has([data-nav-key="task:${data.tasks.trois.id}"])`);
  await expect(row.locator('.report')).toBeVisible();
  await pressDown(page, 6);
  await page.keyboard.press(' ');
  await expect(row).toHaveCount(0);
  // Onglet Log : la tâche est le premier élément.
  await page.keyboard.press('L');
  await expect(page.locator(`#journal li.task:has([data-nav-key="task:${data.tasks.trois.id}"]) .report-done`)).toBeVisible();
  await pressDown(page, 1);
  expect(await current(page)).toBe(`task:${data.tasks.trois.id}`);
  await page.keyboard.press('r');
  await expect(row.locator('.report')).toHaveCount(0);
  expect(store.journal({ projectId: data.beta.id }).days[0].tasks[0].bugtracker_at).toBeNull();
});

// Titres des tâches à faire, par projet, tels qu'enregistrés.
const order = (store: Store) => store.state().projects.map((p) => p.tasks.map((t) => t.title));

test('Alt+↑ / Alt+↓ changent l’ordre dans le projet ; le focus suit la tâche', async ({ page, store, data }) => {
  await pressDown(page, 3); // « Deux »
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.locator(`#project-${data.alpha.id} .name`)).toHaveText(['Alpha', 'Deux', 'Une']);
  expect(order(store)).toEqual([['Deux', 'Une'], ['Trois']]);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);

  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator(`#project-${data.alpha.id} .name`)).toHaveText(['Alpha', 'Une', 'Deux']);
  // Ordre conservé après rechargement.
  await reload(page);
  await expect(page.locator(`#project-${data.alpha.id} .name`)).toHaveText(['Alpha', 'Une', 'Deux']);
});

test('en bord de projet, la tâche passe dans le projet voisin', async ({ page, store, data }) => {
  await pressDown(page, 3); // « Deux », dernière d'Alpha
  await page.keyboard.press('Alt+ArrowDown'); // → en tête de Beta
  await expect(page.locator(`#project-${data.beta.id} .name`)).toHaveText(['Beta', 'Deux', 'Trois']);
  expect(order(store)).toEqual([['Une'], ['Deux', 'Trois']]);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);

  await page.keyboard.press('Alt+ArrowUp'); // → retour en fin d'Alpha
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
  await expect(page.locator(`#project-${data.alpha.id} .name`)).toHaveText(['Alpha', 'Une', 'Deux']);
  expect(order(store)).toEqual([['Une', 'Deux'], ['Trois']]);
});

test('Alt+k / Alt+j comme Alt+↑ / Alt+↓ ; tout en haut, rien ne bouge', async ({ page, store, data }) => {
  await pressDown(page, 2); // « Une », première du premier projet
  await page.keyboard.press('Alt+KeyK');
  await page.waitForTimeout(200);
  expect(order(store)).toEqual([['Une', 'Deux'], ['Trois']]);
  await page.keyboard.press('Alt+KeyJ');
  await expect(page.locator(`#project-${data.alpha.id} .name`)).toHaveText(['Alpha', 'Deux', 'Une']);
});

test('vers un projet vide ; les projets archivés masqués sont sautés', async ({ page, store, data }) => {
  const gamma = store.createProject('Gamma'); // vide, après Beta
  store.updateProject(data.beta.id, { archived: true });
  await reload(page);
  await expect(page.locator('.project')).toHaveCount(2); // Alpha, Gamma
  await pressDown(page, 3); // « Deux »
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator(`#project-${gamma.id} .name`)).toHaveText(['Gamma', 'Deux']);
  expect(store.state().projects.find((p) => p.id === gamma.id)!.tasks.map((t) => t.title)).toEqual(['Deux']);
});

// --- Favoris, archive, suppression ---------------------------------------

test('cœur : projet favori (plein, rouge) ; bouton Favoris et F filtrent', async ({ page, store, data }) => {
  await expect(page.locator('#favorites-only')).toHaveCount(0); // aucun favori : pas de bouton
  const heart = page.locator(`#project-${data.beta.id}`).getByRole('button', { name: 'Favori' });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await expect(heart).toHaveAttribute('title', 'Ajouter aux favoris (f)');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await expect(heart).toHaveAttribute('title', 'Retirer des favoris (f)');
  await expect(heart.locator('svg')).toHaveAttribute('fill', 'currentColor');
  expect(store.state().projects.find((p) => p.id === data.beta.id)!.favorite_at).toBeTruthy();

  const filter = page.locator('#favorites-only');
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.project')).toHaveCount(1);
  await expect(page.locator('.project .name').first()).toHaveText('Beta');

  // F au clavier : bascule le filtre.
  await page.keyboard.press('F');
  await expect(page.locator('.project')).toHaveCount(2);
  await page.keyboard.press('F');
  await expect(page.locator('.project')).toHaveCount(1);
});

test('A : bascule le filtre Archivés', async ({ page, store, data }) => {
  store.updateProject(data.beta.id, { archived: true });
  await reload(page);
  const filter = page.locator('#archived-only');
  await expect(filter).toHaveAttribute('title', 'Afficher seulement les projets archivés (A)');
  await expect(page.locator('.project .project-head .name')).toHaveText(['Alpha']);
  await page.keyboard.press('A');
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.project .project-head .name')).toHaveText(['Beta']);
  await page.keyboard.press('A');
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.project .project-head .name')).toHaveText(['Alpha']);
});

test('archiver et supprimer : boutons icônes nommés, titre au survol', async ({ page, store, data }) => {
  const alpha = page.locator(`#project-${data.alpha.id}`);
  // Boutons visibles au survol (ou au focus du projet) seulement.
  await alpha.locator('.project-head').hover();
  const archive = alpha.getByRole('button', { name: 'Archiver le projet' });
  await expect(archive).toHaveAttribute('title', 'Archiver le projet (a)');
  await archive.click();
  await expect(page.locator('.project')).toHaveCount(1);
  expect(store.state().projects.find((p) => p.id === data.alpha.id)!.archived_at).toBeTruthy();

  // Archivés : seulement les projets archivés.
  await page.locator('#archived-only').click();
  await expect(page.locator('.project')).toHaveCount(1);
  await alpha.locator('.project-head').hover();
  await expect(alpha.getByRole('button', { name: 'Désarchiver le projet' })).toBeVisible();
  await page.locator('#archived-only').click();

  // Corbeille : comme x x, en deux temps, sans fenêtre de confirmation.
  const beta = page.locator(`#project-${data.beta.id}`);
  let dialogs = 0;
  page.on('dialog', () => dialogs++);
  await beta.locator('.project-head').hover();
  await beta.getByRole('button', { name: 'Supprimer le projet' }).click();
  await expect(beta.locator('.confirm-delete')).toContainText('supprimer le projet et ses tâches');
  expect(store.state().projects).toHaveLength(2); // pas encore supprimé
  await beta.getByRole('button', { name: 'Confirmer la suppression du projet' }).click();
  await expect(beta).toHaveCount(0);
  expect(dialogs).toBe(0);
  expect(store.state().projects.map((p) => p.name)).toEqual(['Alpha']);
});

test('boutons de filtre : à reporter, Archivés, Favoris, dans cet ordre, seulement si utiles', async ({ page, store, data }) => {
  const row = page.locator('#bugtracker-pending, #archived-only, #favorites-only');
  await expect(row).toHaveCount(0); // rien à reporter, ni archivé, ni favori
  store.updateTask(data.tasks.une.id, { bugtracker: 'wanted' });
  const gamma = store.createProject('Gamma');
  store.updateProject(gamma.id, { archived: true });
  store.updateProject(data.beta.id, { favorite: true });
  await reload(page);
  expect(await row.evaluateAll((els) => els.map((e) => e.id))).toEqual(['bugtracker-pending', 'archived-only', 'favorites-only']);

  // Archivés : comme « à reporter », un filtre : seulement les projets archivés.
  const archived = page.locator('#archived-only');
  await expect(archived).toHaveAttribute('aria-pressed', 'false');
  for (const id of ['#bugtracker-pending', '#archived-only', '#favorites-only']) {
    await expect(page.locator(`${id} svg`), id).toHaveAttribute('fill', 'none'); // icône vide : filtre inactif
  }
  await expect(page.locator('#projects .project-head .name')).toHaveText(['Alpha', 'Beta']);
  await archived.click();
  await expect(archived).toHaveAttribute('aria-pressed', 'true');
  // Sobre : pas de fond coloré, l'icône se remplit.
  await expect(archived.locator('svg')).toHaveAttribute('fill', 'currentColor');
  await expect(archived).not.toHaveClass(/bg-primary/);
  await expect(page.locator('#projects .project-head .name')).toHaveText(['Gamma']);
  await archived.click();
  await expect(page.locator('#projects .project-head .name')).toHaveText(['Alpha', 'Beta']);
});

test('filtres combinés (ET) : aucun bouton ne disparaît quand un autre est actif', async ({ page, store, data }) => {
  // Gamma : archivé, favori, avec une tâche à reporter. Delta : archivé seulement.
  const gamma = store.createProject('Gamma');
  store.updateTask(store.createTask(gamma.id, 'G à reporter').id, { bugtracker: 'wanted' });
  store.createTask(gamma.id, 'G normale');
  store.updateProject(gamma.id, { archived: true, favorite: true });
  const delta = store.createProject('Delta');
  store.updateProject(delta.id, { archived: true });
  store.updateProject(data.alpha.id, { favorite: true }); // favori, non archivé
  store.updateTask(data.tasks.trois.id, { bugtracker: 'wanted' }); // Beta : à reporter, non favori
  await reload(page);

  const buttons = page.locator('#bugtracker-pending, #archived-only, #favorites-only');
  const heads = page.locator('#projects .project-head .name');
  const tasks = page.locator('#projects .task .name');
  await expect(page.locator('#bugtracker-pending')).toHaveText('2 tâches à reporter'); // tous projets confondus

  await page.locator('#archived-only').click();
  await expect(heads).toHaveText(['Gamma', 'Delta']);
  await expect(buttons).toHaveCount(3); // Favoris et à reporter restent là
  await page.locator('#favorites-only').click(); // archivés ET favoris
  await expect(heads).toHaveText(['Gamma']);
  await expect(tasks).toHaveText(['G à reporter', 'G normale']);
  await page.locator('#bugtracker-pending').click(); // ET à reporter
  await expect(heads).toHaveText(['Gamma']);
  await expect(tasks).toHaveText(['G à reporter']);
  await expect(buttons).toHaveCount(3);

  // Liste vide avec plusieurs filtres : message générique.
  const empty = page.locator('#projects .empty');
  await page.locator('#archived-only').click(); // favoris ET à reporter, non archivés : aucun
  await expect(heads).toHaveCount(0);
  await expect(empty).toHaveText('Aucune tâche avec les filtres demandés.');
  await expect(buttons).toHaveCount(3);
  await page.locator('#favorites-only').click(); // à reporter seulement
  await expect(heads).toHaveText(['Beta']);
  await page.locator('#bugtracker-pending').click();

  // Sans « à reporter » : il s'agit de projets.
  store.updateProject(gamma.id, { favorite: false });
  await reload(page);
  await page.locator('#archived-only').click();
  await page.locator('#favorites-only').click(); // archivés ET favoris : aucun
  await expect(empty).toHaveText('Aucun projet avec les filtres demandés.');
  await page.locator('#archived-only').click(); // Favoris seul : Alpha
  await expect(heads).toHaveText(['Alpha']);
});

test('barre d’outils : filtres à la place de l’export / import, qui sont dans les réglages', async ({ page }) => {
  await expect(page.getByRole('banner').getByRole('button', { name: /Importer/ })).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Exporter' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Réglages' }).click();
  await expect(page.getByRole('link', { name: 'Exporter' })).toHaveAttribute('href', '/api/export');
  // Import .md depuis les réglages, visible au retour sur la liste.
  await page.locator('input[type=file][accept^=".md"]').setInputFiles({
    name: 'import.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('- Importé\n  - Tâche importée\n'),
  });
  await expect(page.locator('#data-status')).toHaveText('Import : 1 projet(s) créé(s), 1 tâche(s).');
  await page.keyboard.press('Escape');
  await expect(page.locator('#projects .project-head .name')).toHaveText(['Alpha', 'Beta', 'Importé']);
});

test('clavier sur un projet : f favori, a archiver, x x supprimer, u annule tout', async ({ page, store, data }) => {
  const beta = () => store.state().projects.find((p) => p.id === data.beta.id);
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-20', notes: 'historique' });
  store.createTask(data.beta.id, 'Quatre');
  await reload(page);
  await pressDown(page, 5); // Beta
  expect(await current(page)).toBe(`project:${data.beta.id}`);

  // Attente sur l'affichage, pas sur la base : l'annulation n'est mémorisée
  // qu'une fois la réponse reçue, juste avant le nouvel affichage.
  const heart = page.locator(`#project-${data.beta.id}`).getByRole('button', { name: 'Favori' });
  await page.keyboard.press('f');
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  expect(beta()!.favorite_at).toBeTruthy();
  await expect(page.getByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true'); // pas un raccourci global
  await page.keyboard.press('u');
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  expect(beta()!.favorite_at).toBeNull();

  await page.keyboard.press('a');
  await expect(page.locator(`#project-${data.beta.id}`)).toHaveCount(0);
  expect(beta()!.archived_at).toBeTruthy();
  await page.keyboard.press('u');
  await expect(page.locator(`#project-${data.beta.id}`)).toHaveCount(1);
  expect(await current(page)).toBe(`project:${data.beta.id}`);

  // x : message de confirmation ; Échap annule ; x x supprime.
  await page.keyboard.press('x');
  await expect(page.locator(`#project-${data.beta.id} .confirm-delete`)).toContainText('x ou corbeille à nouveau : supprimer le projet');
  await page.keyboard.press('Escape');
  await expect(page.locator('.confirm-delete')).toHaveCount(0);
  await page.keyboard.press('x');
  await page.keyboard.press('x');
  await expect(page.locator(`#project-${data.beta.id}`)).toHaveCount(0);
  expect(beta()).toBeUndefined();

  // u : projet, tâches à faire et tâche faite (Log) reviennent à l'identique.
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : suppression du projet');
  await expect(page.locator(`#project-${data.beta.id} .task .name`)).toHaveText(['Quatre']);
  expect(await current(page)).toBe(`project:${data.beta.id}`);
  const trois = store.journal({ from: '2026-09-20', to: '2026-09-20' }).days[0].tasks[0];
  expect([trois.title, trois.notes]).toEqual(['Trois', 'historique']);
});

// --- Suivi du bugtracker ---------------------------------------------------------

const row = (page: Page, taskId: number) => page.locator(`li.task:has([data-nav-key="task:${taskId}"])`);

test('r fait tourner : à reporter (contour) → ticket demandé dans la ligne (Échap : retour à rien) → reportée → rien', async ({ page, store, data }) => {
  const une = row(page, data.tasks.une.id);
  await pressDown(page, 2);
  await page.keyboard.press('r');
  await expect(une.locator('.report-wanted')).toBeVisible();
  expect(store.state().bugtrackerPending).toBe(1);

  await page.keyboard.press('r');
  // Ticket demandé dans la ligne, sans fiche ; Échap abandonne et rend le focus à la tâche.
  const ticket = une.getByRole('textbox', { name: 'Ticket' });
  await expect(ticket).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(ticket).toHaveCount(0);
  // Saisie abandonnée : plus de report (sinon, pas moyen d'en sortir).
  await expect(une.locator('.report')).toHaveCount(0);
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.une.id}`);
  expect(store.state().projects[0].tasks[0]).toMatchObject({ bugtracker_wanted_at: null, bugtracker_at: null });

  // Reportée (avec ticket), r retire le report.
  await page.keyboard.press('r');
  await expect(une.locator('.report-wanted')).toBeVisible();
  await page.keyboard.press('r');
  await page.keyboard.type('PROJ-1');
  await page.keyboard.press('Enter');
  await expect(une.locator('.report-done')).toHaveText('reporté · PROJ-1');
  await page.keyboard.press('r');
  await expect(une.locator('.report')).toHaveCount(0);
  expect(store.state().projects[0].tasks[0]).toMatchObject({ bugtracker_wanted_at: null, bugtracker_at: null, bugtracker_key: null });
  // u : le report revient avec son ticket.
  await page.keyboard.press('u');
  await expect(une.locator('.report-done')).toHaveText('reporté · PROJ-1');
});

test('r r : ticket saisi dans la ligne, clé + URL du bugtracker = lien cliquable, u le retire', async ({ page, store, data }) => {
  store.updateSettings({ bugtracker_base_url: 'https://entreprise.tickets.fr' });
  await reload(page);
  await pressDown(page, 2);
  await page.keyboard.press('r');
  await page.keyboard.press('r'); // ticket demandé dans la ligne
  const ticket = row(page, data.tasks.une.id).getByRole('textbox', { name: 'Ticket' });
  await expect(ticket).toBeFocused();
  await page.keyboard.type('proj-7');
  await page.keyboard.press('Enter');

  await expect(ticket).toHaveCount(0);
  const link = row(page, data.tasks.une.id).locator('a.report-link');
  await expect(link).toHaveAttribute('href', 'https://entreprise.tickets.fr/browse/PROJ-7');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveText('reporté · PROJ-7');
  // À l'écran, l'identifiant seul : « reporté » est réservé aux lecteurs d'écran.
  await expect(link.getByText('reporté', { exact: false })).toHaveClass(/sr-only/);
  await expect(link.locator('.report-key')).toHaveText('PROJ-7');
  await expect(row(page, data.tasks.une.id).locator('.report-done')).toBeVisible(); // ticket = reportée
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.une.id}`);

  // u retire le ticket : la tâche revient à reporter.
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : reportée');
  await expect(row(page, data.tasks.une.id).locator('.report-wanted')).toBeVisible();
  await expect(row(page, data.tasks.une.id).locator('.report-done')).toHaveCount(0);
});

// Pastille ou champ du ticket d'un projet : à droite, collé aux icônes du survol
// (archive, corbeille), qui gardent leur place même invisibles.
const rightBeforeActions = (el: Locator) =>
  el.evaluate((e) => {
    const actions = e.nextElementSibling;
    if (!actions?.classList.contains('actions')) return false;
    return actions.getBoundingClientRect().left - e.getBoundingClientRect().right < 12;
  });

test('r sur un projet : ticket dans la ligne, pastille cliquable après le nom, modifiable, u l’annule', async ({ page, store, data }) => {
  store.updateSettings({ bugtracker_base_url: 'https://entreprise.tickets.fr' });
  await reload(page);
  const head = page.locator(`#project-${data.alpha.id} .project-head`);
  await page.keyboard.press('ArrowDown'); // en-tête d'Alpha
  await page.keyboard.press('r');
  const ticket = head.getByRole('textbox', { name: 'Ticket' });
  await expect(ticket).toBeFocused();
  await expect(ticket).toHaveValue('');
  expect(await rightBeforeActions(ticket)).toBe(true);
  await page.keyboard.type('epic-12');
  await page.keyboard.press('Enter');

  await expect(ticket).toHaveCount(0);
  const link = head.locator('a.project-ticket');
  await expect(link).toHaveAttribute('href', 'https://entreprise.tickets.fr/browse/EPIC-12');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute('title', 'Ticket du projet — ouvrir le ticket');
  await expect(link).toHaveText('ticket · EPIC-12');
  await expect(link.locator('.report-key')).toHaveText('EPIC-12');
  expect(await rightBeforeActions(link)).toBe(true); // même pastille qu'une tâche reportée
  await expect(link).toHaveClass(/bg-pink-100/); // rose : distincte du bleu des tâches reportées
  await expect(link).not.toHaveClass(/report-done/);
  await expect.poll(() => current(page)).toBe(`project:${data.alpha.id}`);
  // Seulement sur le projet : ses tâches ne sont pas reportées pour autant.
  await expect(page.locator('li.task .report')).toHaveCount(0);

  // r à nouveau : le champ reprend le ticket ; Échap abandonne sans rien changer.
  await page.keyboard.press('r');
  await expect(ticket).toHaveValue('EPIC-12');
  await page.keyboard.press('Escape');
  await expect(ticket).toHaveCount(0);
  await expect(link).toHaveText('ticket · EPIC-12');
  await expect.poll(() => current(page)).toBe(`project:${data.alpha.id}`);

  // u retire le ticket.
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : ticket du projet');
  await expect(head.locator('.project-ticket')).toHaveCount(0);
});

test('ticket du projet : pas d’icône ; vidé, il est retiré ; lien refusé ; absent des autres onglets', async ({ page, store, data }) => {
  store.updateProject(data.beta.id, { bugtrackerKey: 'EPIC-3' });
  await reload(page);
  const head = page.locator(`#project-${data.beta.id} .project-head`);
  await expect(head.locator('.project-ticket')).toHaveText('ticket · EPIC-3');
  await expect(head.locator('a.project-ticket')).toHaveCount(0); // sans URL de base : pas de lien
  // Pas d'icône pour le ticket (comme le report d'une tâche) : r seulement.
  await head.hover();
  await expect(head.getByRole('button', { name: 'Ticket du projet' })).toHaveCount(0);
  await expect(head.locator('.actions button')).toHaveCount(2); // archive, corbeille
  await head.locator('.name').focus();
  await page.keyboard.press('r');
  const ticket = head.getByRole('textbox', { name: 'Ticket' });
  await expect(ticket).toHaveValue('EPIC-3');
  await ticket.fill('');
  await page.keyboard.press('Enter');
  await expect(head.locator('.project-ticket')).toHaveCount(0);
  expect(store.state().projects[1]).toMatchObject({ bugtracker_key: null });

  // Lien complet refusé (identifiant seul) : message, rien ne change.
  await page.keyboard.press('r');
  await ticket.fill('https://roadmap.exemple.fr/theme/9');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText('Identifiant attendu, ex. PROJ-123');
  await expect(head.locator('.project-ticket')).toHaveCount(0);
  store.updateProject(data.beta.id, { bugtrackerKey: 'EPIC-4' });
  await reload(page);
  await expect(head.locator('.project-ticket')).toHaveText('ticket · EPIC-4');

  // Onglet Aujourd'hui : pas de pastille de projet.
  await page.keyboard.press('T');
  await expect(page.locator('.project-ticket')).toHaveCount(0);
});

test('r dans le nom d’un projet en édition : une lettre, pas le champ du ticket', async ({ page }) => {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('r');
  await expect(page.locator('input.edit')).toHaveValue(/r$/);
  await expect(page.getByRole('textbox', { name: 'Ticket' })).toHaveCount(0);
});

test('r r : identifiant invalide ou vide, retour à rien ; u rend « à reporter »', async ({ page, store, data }) => {
  const une = row(page, data.tasks.une.id);
  await pressDown(page, 2);
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  const ticket = une.getByRole('textbox', { name: 'Ticket' });
  await expect(ticket).toBeFocused();
  await page.keyboard.type('pas un ticket');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText('Identifiant attendu, ex. PROJ-123');
  await expect(ticket).toHaveCount(0);
  await expect(une.locator('.report')).toHaveCount(0);
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.une.id}`);
  expect(store.state().projects[0].tasks[0]).toMatchObject({ bugtracker_wanted_at: null, bugtracker_key: null });
  // u : de nouveau à reporter.
  await page.keyboard.press('u');
  await expect(une.locator('.report-wanted')).toBeVisible();

  await page.keyboard.press('r');
  await expect(ticket).toBeFocused();
  await page.keyboard.press('Enter'); // vide
  await expect(ticket).toHaveCount(0);
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.une.id}`);
  await expect(une.locator('.report')).toHaveCount(0);
});

test('fiche : ticket en un contrôle, aucun → à reporter → identifiant ; Échap ou invalide : retour à aucun ; ✕ et u', async ({ page, store, data }) => {
  const une = row(page, data.tasks.une.id);
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  const control = dialog.locator('.report-control');
  await expect(control).toHaveText('aucun');
  await control.click();
  await expect(control).toHaveText('à reporter');
  expect(store.state().bugtrackerPending).toBe(1);

  // Champ de l'identifiant : Échap abandonne (la fiche reste ouverte) et revient à « aucun » ; invalide aussi.
  await control.click();
  const ticket = dialog.getByRole('textbox', { name: 'Ticket' });
  await expect(ticket).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ticket).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(control).toHaveText('aucun');
  await expect(control).toBeFocused();
  await control.click();
  await control.click();
  await page.keyboard.type('pas un ticket');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText('Identifiant attendu, ex. PROJ-123');
  await expect(control).toHaveText('aucun');

  // Identifiant valide : reportée, comme sur la ligne.
  await control.click();
  await control.click();
  await page.keyboard.type('proj-2');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.report-done')).toHaveText('reporté · PROJ-2');
  await expect(une.locator('.report-done')).toHaveText('reporté · PROJ-2');

  // ✕ : plus de report ; u le rend avec son identifiant.
  await dialog.getByRole('button', { name: 'Retirer le report' }).click();
  await expect(control).toHaveText('aucun');
  expect(store.state().projects[0].tasks[0]).toMatchObject({ bugtracker_wanted_at: null, bugtracker_key: null });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('u');
  await expect(une.locator('.report-done')).toHaveText('reporté · PROJ-2');
});

test('fiche : r comme sur la ligne (lecture et édition hors champ) ; clic ailleurs = retour à aucun ; r dans le titre = une lettre', async ({ page, store }) => {
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  const control = dialog.locator('.report-control');
  await page.keyboard.press('r');
  await expect(control).toHaveText('à reporter');
  await page.keyboard.press('r');
  const ticket = dialog.getByRole('textbox', { name: 'Ticket' });
  await expect(ticket).toBeFocused();
  // Clic ailleurs : comme Échap, retour à « aucun ».
  await dialog.locator('.notes-preview').click();
  await expect(ticket).toHaveCount(0);
  await expect(control).toHaveText('aucun');
  expect(store.state().bugtrackerPending).toBe(0);

  await page.keyboard.press('r');
  await page.keyboard.press('r');
  await expect(ticket).toBeFocused();
  await page.keyboard.type('proj-3');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.report-done')).toHaveText('reporté · PROJ-3');
  await control.locator('button').focus(); // ✕
  await page.keyboard.press('r'); // retire le report
  await expect(control).toHaveText('aucun');

  // En édition, dans le titre : r s'écrit.
  await page.keyboard.press('e');
  await dialog.getByLabel('Titre').press('End');
  await page.keyboard.type('r');
  await expect(dialog.getByLabel('Titre')).toHaveValue('Uner');
  await expect(control).toHaveText('aucun');
});

test('fiche Markdown : e édite (titre → Tab → ticket → dates → tags → contenu), Ctrl+Entrée lecture puis fermeture', async ({ page, store, data }) => {
  await pressDown(page, 3); // « Deux »
  await page.keyboard.press('Shift+Enter');
  const dialog = page.getByRole('dialog', { name: 'Deux' });
  const preview = dialog.locator('.notes-preview');
  await expect(dialog.locator('.reader')).toBeFocused();
  await expect(preview).toHaveText('Aucun contenu');
  await expect(dialog.locator('.report-control')).toHaveText('aucun');

  await page.keyboard.press('e');
  await expect(dialog.getByLabel('Titre')).toBeFocused();
  await expect(dialog.getByLabel('Titre')).toHaveValue('Deux');
  await page.keyboard.press('Tab');
  await expect(dialog.locator('.report-control')).toBeFocused();
  // Champ date : Tab passe d'abord par ses parties (jour, mois, année ; natif,
  // leur nombre dépend du navigateur) : Tab jusqu'au champ suivant, dans l'ordre.
  const tabTo = async (field: Locator) => {
    for (let i = 0; i < 5 && !(await field.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(field).toBeFocused();
  };
  await tabTo(dialog.getByLabel('Date prévue'));
  await tabTo(dialog.getByLabel('Échéance'));
  await tabTo(dialog.getByRole('combobox', { name: 'Tags' }));
  await page.keyboard.press('Tab');
  const editor = dialog.getByLabel('Contenu');
  await expect(editor).toBeFocused();
  // Les raccourcis de la liste ne s'appliquent pas dans la fiche (x, J, Espace…).
  await page.keyboard.type('## Contexte\nVoir x et J avec **Paul** : [spec](https://docs.exemple.fr/specs)');
  await page.keyboard.press('ControlOrMeta+Enter'); // lecture (et enregistrement)
  await expect(dialog.locator('.reader')).toBeFocused();
  await expect(preview.getByRole('heading', { name: 'Contexte' })).toBeVisible();
  await expect(preview.locator('strong')).toHaveText('Paul');
  const specLink = preview.getByRole('link', { name: 'spec' });
  await expect(specLink).toHaveAttribute('href', 'https://docs.exemple.fr/specs');
  await expect(specLink).toHaveAttribute('target', '_blank');
  await expect(specLink).toHaveAttribute('rel', 'noopener noreferrer');
  expect(store.state().projects[0].tasks[1].notes).toContain('## Contexte');

  await page.keyboard.press('ControlOrMeta+Enter'); // fermeture
  await expect(dialog).toHaveCount(0);
  const deux = row(page, data.tasks.deux.id);
  await expect(deux.locator('.confirm-delete')).toHaveCount(0);
  await expect(deux.getByRole('button', { name: 'Voir les détails' })).toBeVisible();
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.deux.id}`);

  // Double-clic sur le contenu : édition directement dans le contenu ; Échap ferme en enregistrant.
  await deux.getByRole('button', { name: 'Voir les détails' }).click();
  await page.getByRole('dialog', { name: 'Deux' }).locator('.notes-preview').dblclick();
  await expect(page.getByRole('dialog', { name: 'Deux' }).getByLabel('Contenu')).toBeFocused();
  // Fin du texte : Ctrl+Fin sous Linux / Windows, Cmd+↓ sur macOS (Cmd+Fin n'y fait rien).
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.type(' (fin)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(store.state().projects[0].tasks[1].notes).toMatch(/\(fin\)$/);
});

test('fiche Markdown : HTML dangereux neutralisé', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, {
    notes: '<img src=x onerror="window.pwned=1"> <script>window.pwned=1</script> [clic](javascript:window.pwned=1)',
  });
  await reload(page);
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const preview = page.getByRole('dialog', { name: 'Une' }).locator('.notes-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('script, [onerror]')).toHaveCount(0);
  await expect(preview.locator('a[href^="javascript"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
});

test('réglages (/admin) : URL du bugtracker conservée en base, lien depuis la fiche', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { bugtracker: 'done', bugtrackerKey: 'PROJ-1' });
  await reload(page);
  // Sans URL d'entreprise : la clé s'affiche, sans lien.
  await expect(row(page, data.tasks.une.id).locator('.report-done')).toHaveText('reporté · PROJ-1');
  await expect(row(page, data.tasks.une.id).locator('a.report-link')).toHaveCount(0);

  await page.getByRole('link', { name: 'Réglages' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
  // Boutons homogènes : même hauteur, à contour, sans fond coloré.
  const save = page.getByRole('button', { name: 'Enregistrer' }).first();
  const importMd = page.getByRole('button', { name: 'Importer .md' });
  expect((await save.boundingBox())!.height).toBe((await importMd.boundingBox())!.height);
  await expect(save).toHaveCSS('background-color', await importMd.evaluate((b) => getComputedStyle(b).backgroundColor));
  await page.getByLabel('URL de base des tickets').fill('https://entreprise.tickets.fr/');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByText('Réglages enregistrés.')).toBeVisible();
  expect(store.settings().bugtracker_base_url).toBe('https://entreprise.tickets.fr');

  // Rechargement direct de /admin : valeur relue en base.
  await page.reload();
  await expect(page.getByLabel('URL de base des tickets')).toHaveValue('https://entreprise.tickets.fr');

  // Échap : retour à la page principale.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
  await expect(row(page, data.tasks.une.id).locator('a.report-link')).toHaveAttribute(
    'href',
    'https://entreprise.tickets.fr/browse/PROJ-1',
  );
});

test('réglages : Importer .sqlite en deux temps, sans fenêtre de confirmation ; Échap annule', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', () => dialogs++);
  await page.goto('/admin');
  const importDb = page.getByRole('button', { name: 'Importer .sqlite' });
  const warning = page.getByRole('alert').filter({ hasText: 'remplacera toute la base' });

  // 1er clic : message seulement ; Échap annule sans quitter les Réglages.
  await importDb.click();
  await expect(warning).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(warning).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin$/);

  // 1er clic puis 2e clic : choix du fichier, import direct.
  const file = Buffer.from(await (await page.request.get('/api/export')).body());
  await importDb.click();
  const chooser = page.waitForEvent('filechooser');
  await importDb.click();
  await (await chooser).setFiles({ name: 'base.sqlite', mimeType: 'application/octet-stream', buffer: file });
  await expect(page.locator('#data-status')).toHaveText('Base importée.');
  await expect(warning).toHaveCount(0);
  expect(dialogs).toBe(0);
});

test('compteur « à reporter » : filtre la zone des projets seulement (R ou clic)', async ({ page, store, data }) => {
  store.updateTask(data.tasks.deux.id, { bugtracker: 'wanted' });
  const faite = store.createTask(data.beta.id, 'Faite à reporter');
  store.updateTask(faite.id, { doneAt: '2026-09-25', bugtracker: 'wanted' });
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-25' });
  await reload(page);

  const counter = page.locator('#bugtracker-pending');
  await expect(counter).toHaveText('1 tâche à reporter'); // tâches à faire des projets
  await page.keyboard.press('R');
  await expect(counter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Deux']);
  await page.keyboard.press('L');
  await expect(page.locator('#journal .name')).toHaveText(['Trois', 'Faite à reporter']); // Log inchangé
  await page.keyboard.press('P'); // retour aux projets : filtre gardé
  await expect(counter).toHaveAttribute('aria-pressed', 'true');

  // 2e appui : les reportées (aucune ici) ; 3e : plus de filtre.
  await counter.click();
  await expect(counter).toHaveText('0 tâche reportée');
  await expect(page.locator('#projects .empty')).toHaveText('Aucune tâche à faire reportée.');
  await counter.click();
  await expect(counter).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une', 'Deux', 'Beta']);
  await page.keyboard.press('L');
  await expect(page.locator('#journal .name')).toHaveText(['Trois', 'Faite à reporter']);
});

test('R : à reporter → reportées → toutes ; bouton visible avec des reportées seulement', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { bugtracker: 'wanted' });
  store.updateTask(data.tasks.trois.id, { bugtracker: 'done', bugtrackerKey: 'PROJ-3' });
  await reload(page);
  const counter = page.locator('#bugtracker-pending');
  await expect(counter).toHaveText('1 tâche à reporter');
  await page.keyboard.press('R');
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une']);
  await page.keyboard.press('R');
  await expect(counter).toHaveText('1 tâche reportée');
  await expect(page.locator('#projects .name')).toHaveText(['Beta', 'Trois']);
  await page.keyboard.press('R');
  await expect(counter).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une', 'Deux', 'Beta', 'Trois']);

  // Plus de tâche à reporter, mais une reportée : le bouton reste, sur les reportées.
  store.updateTask(data.tasks.une.id, { bugtracker: 'none' });
  await reload(page);
  await expect(counter).toHaveText('1 tâche reportée');
  // Anciennes touches sans effet : * et f (hors projet) ; r hors tâche.
  await page.locator('body').press('*');
  await page.locator('body').press('f');
  await page.locator('body').press('r');
  await expect(counter).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('tab', { name: 'Projets' })).toHaveAttribute('aria-selected', 'true');
});

// Non-régression : les boutons sous la barre d'outils ne touchent qu'à la zone des projets.
test('boutons à reporter, Archivés, Favoris : le Log ne change pas', async ({ page, store, data }) => {
  const gamma = store.createProject('Gamma');
  store.updateTask(store.createTask(gamma.id, 'Gamma faite').id, { doneAt: '2026-09-25' });
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-25' });
  store.updateTask(data.tasks.une.id, { bugtracker: 'wanted' });
  store.updateProject(gamma.id, { archived: true });
  store.updateProject(data.alpha.id, { favorite: true });
  await reload(page);

  const log = page.locator('#journal');
  // Photo du Log, dans son onglet (L), puis retour aux projets (L).
  const snapshot = async () => {
    await page.keyboard.press('L');
    await expect(log.locator('.day')).toHaveCount(1);
    const shot = {
      names: await log.locator('.name').allTextContents(),
      labels: await log.locator('.project-label').allTextContents(),
      count: await page.locator('#log-count').textContent(),
      date: await page.locator('#filter-date').inputValue(),
      options: await page.locator('#filter-project option').allTextContents(),
    };
    await page.keyboard.press('P');
    await expect(page.locator('#projects')).toBeVisible();
    return shot;
  };
  const before = await snapshot();
  expect(before.names).toEqual(['Trois', 'Gamma faite']); // tâche d'un projet archivé comprise
  expect(before.options).toEqual(['Tous les projets', 'Alpha', 'Beta', 'Gamma (archivé)']);

  for (const id of ['#bugtracker-pending', '#archived-only', '#favorites-only']) {
    const button = page.locator(id);
    const projects = await page.locator('#projects .project').count();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.locator('#projects .project').count(), id).not.toBe(projects); // la zone des projets change
    expect(await snapshot(), id).toEqual(before); // le Log, non
    await button.click();
    if (id === '#bugtracker-pending') {
      // Report : à reporter → reportées → tous ; le Log ne change toujours pas.
      await expect(button).toHaveText('0 tâche reportée');
      expect(await snapshot(), id).toEqual(before);
      await button.click();
    }
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  }
  // Au clavier (R, F), combinés.
  await page.keyboard.press('R');
  await page.keyboard.press('F');
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une']);
  expect(await snapshot()).toEqual(before);

  // Et le Log filtré (recherche) ne touche pas à la zone des projets.
  await page.keyboard.press('L');
  await page.locator('#log-search').fill('Gamma');
  await expect(log.locator('.name')).toHaveText(['Gamma faite']);
  await page.getByRole('tab', { name: 'Projets' }).click();
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une']);
});

test('fiche rouverte : contenu relu depuis les données à jour', async ({ page, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press('o');
  await page.keyboard.press('e');
  await page.getByRole('dialog', { name: 'Une' }).getByLabel('Contenu').fill('premier jet');
  await page.keyboard.press('Escape'); // enregistré à la fermeture
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.une.id}`);
  await page.keyboard.press('o'); // rouverte
  await page.keyboard.press('e');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await expect(dialog.getByLabel('Contenu')).toHaveValue('premier jet'); // relu depuis la base
});

test('bouton « tâches à reporter » : place réservée, rien ne bouge quand il apparaît', async ({ page, data }) => {
  const top = () => page.locator('#projects').evaluate((el) => el.getBoundingClientRect().top);
  await expect(page.locator('#bugtracker-pending')).toHaveCount(0);
  const before = await top();
  await pressDown(page, 2);
  await page.keyboard.press('r');
  await expect(page.locator('#bugtracker-pending')).toHaveText('1 tâche à reporter');
  expect(await top()).toBe(before);
  await expect(row(page, data.tasks.une.id).locator('.report-wanted')).toHaveText('à reporter');
});

test('titre long : « … » sur une ligne, titre complet au survol ou au focus clavier', async ({ page, store, data }) => {
  const long = 'Préparer la présentation trimestrielle pour le comité de direction avec les chiffres consolidés de toutes les équipes produit';
  store.updateTask(data.tasks.une.id, { title: long, bugtracker: 'done', bugtrackerKey: 'PROJ-1234' });
  await reload(page);
  const name = page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`);
  // Une seule ligne, coupée : le badge reste visible.
  expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(row(page, data.tasks.une.id).locator('.report-done')).toBeInViewport();
  expect(await row(page, data.tasks.une.id).evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(40);

  await name.hover();
  await expect(page.locator('.full-title')).toHaveText(long);
  await page.mouse.move(400, 650, { steps: 5 }); // déplacement réel (Radix ignore une « téléportation »)
  await expect(page.locator('.full-title')).toHaveCount(0);

  // Au clavier aussi (et annoncé : le titre complet décrit l'élément).
  await pressDown(page, 2);
  await expect(page.locator('.full-title')).toHaveText(long);
  await expect(name).toHaveAccessibleDescription(long);

  // Titre court : pas d'info-bulle.
  await page.keyboard.press('j');
  await page.locator(`[data-nav-key="task:${data.tasks.deux.id}"]`).hover();
  await page.waitForTimeout(500);
  await expect(page.locator('.full-title')).toHaveCount(0);
});

test('titre long au clavier : info-bulle après un court délai, rien si on passe vite dessus', async ({ page, store, data }) => {
  const long = 'Préparer la présentation trimestrielle pour le comité de direction avec les chiffres consolidés de toutes les équipes produit';
  store.updateTask(data.tasks.une.id, { title: long });
  await reload(page);
  await page.mouse.move(0, 0); // pas de survol
  await pressDown(page, 2); // sur le titre long
  await page.waitForTimeout(150);
  await expect(page.locator('.full-title')).toHaveCount(0); // pas encore
  await page.keyboard.press('j'); // on passe
  await page.waitForTimeout(700);
  await expect(page.locator('.full-title')).toHaveCount(0); // jamais affichée
  await page.keyboard.press('k'); // on revient et on s'arrête
  await expect(page.locator('.full-title')).toHaveText(long);
});

test('ligne épurée et fiche ordonnée : titre, ticket, dates, tags, contenu', async ({ page, data }) => {
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveAttribute('placeholder', '+ Ajouter une tâche (n)');
  const une = row(page, data.tasks.une.id);
  await une.hover();
  await expect(une.locator('.actions button')).toHaveCount(0); // ni « reporté », ni « détails », ni suppression (x x)

  await pressDown(page, 2);
  await page.keyboard.press('Shift+Enter');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await expect(dialog).toHaveAccessibleDescription('Alpha'); // « à faire » sous-entendu
  await page.keyboard.press('e');
  // Titre en haut (champ nommé « Titre », sans libellé visible), puis ticket et contenu.
  await expect(dialog.getByLabel('Titre')).toBeFocused();
  const labels = await dialog.locator('label').allTextContents();
  expect(labels).toEqual(['Ticket', 'Date prévue', 'Échéance', 'Tags', 'Contenu']);
});

test('ligne : temps passé (sablier, « 3 min ») au bout du titre, dans les projets et le Log ; rien sans temps', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { timeSpent: 180 });
  await reload(page);
  const une = row(page, data.tasks.une.id);
  await expect(une.locator('.time-spent')).toHaveText('3 min');
  await expect(une.locator('.time-spent')).toHaveClass(/text-muted-foreground/);
  await expect(row(page, data.tasks.deux.id).locator('.time-spent')).toHaveCount(0);
  // Icônes à la même place qu'une ligne sans temps passé.
  const x = async (id: number) => (await row(page, id).locator('.timer').boundingBox())!.x;
  expect(await x(data.tasks.une.id)).toBe(await x(data.tasks.deux.id));

  // Tâche faite : le temps reste affiché dans le Log.
  await pressDown(page, 2);
  await page.keyboard.press(' ');
  await page.keyboard.press('L');
  await expect(page.locator(`#journal li.task:has([data-nav-key="task:${data.tasks.une.id}"]) .time-spent`)).toHaveText('3 min');
});

test('fiche : ▷ du chrono fixe quand ↻ apparaît ; libellés sans « : » ; contenu vide centré, sans italique', async ({ page }) => {
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await expect(dialog.locator('.reader')).toBeFocused();
  const toggle = dialog.locator('.timer-toggle');
  const reset = dialog.locator('.timer-reset');
  await expect(reset).toBeHidden();
  await page.waitForFunction(() => document.getAnimations().length === 0); // ouverture animée finie
  const before = (await toggle.boundingBox())!.x;
  await page.keyboard.press('c');
  await expect(reset).toBeVisible();
  expect((await reset.boundingBox())!.x).toBeLessThan(before); // ↻ à gauche de ▷
  expect((await toggle.boundingBox())!.x).toBe(before);
  await page.keyboard.press('c');

  await expect(dialog.locator('dt')).toHaveText(['Ticket', 'Date prévue', 'Échéance', 'Tags']);
  const preview = dialog.locator('.notes-preview');
  await expect(preview).toHaveText('Aucun contenu');
  await expect(preview).toHaveCSS('justify-content', 'center');
  await expect(preview).toHaveCSS('align-items', 'center');
  await expect(preview).toHaveCSS('font-style', 'normal');
});

test('fiche en lecture : ticket cliquable comme dans la ligne (clé + URL de base)', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { bugtrackerKey: 'PROJ-8' });
  await reload(page);
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  // Sans URL de base : texte seul, pas de lien vide.
  await expect(dialog.locator('.report-key')).toHaveText('PROJ-8');
  await expect(dialog.locator('a.report-link')).toHaveCount(0);
  await page.keyboard.press('Escape');

  store.updateSettings({ bugtracker_base_url: 'https://entreprise.tickets.fr' });
  await reload(page);
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const link = dialog.getByRole('link', { name: 'reporté · PROJ-8' });
  await expect(link).toHaveAttribute('href', 'https://entreprise.tickets.fr/browse/PROJ-8');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('fiche : e modifie le titre ; Entrée dans un champ = enregistrer', async ({ page, store, data }) => {
  // Processeur ralenti (×6), comme sur une CI chargée : la frappe rapide
  // après e puis Tab ne doit jamais retomber dans le titre.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await page.keyboard.press('e');
  const title = dialog.getByLabel('Titre');
  await expect(title).toHaveValue('Une'); // le « e » n'a pas été saisi
  await title.fill('Une, renommée');
  await page.keyboard.press('Enter'); // enregistre et repasse en lecture
  const renamed = page.getByRole('dialog', { name: 'Une, renommée', exact: true });
  await expect(renamed.locator('.reader')).toBeFocused();
  expect(store.state().projects[0].tasks[0]).toMatchObject({ title: 'Une, renommée' });

  // Titre vide refusé, erreur annoncée sous le champ (la fiche porte alors un nom vide).
  await page.keyboard.press('e');
  const any = page.getByRole('dialog');
  await any.getByLabel('Titre').fill('  ');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(any.getByRole('alert')).toHaveText('Le titre est obligatoire');
  await expect(any.getByLabel('Titre')).toHaveAttribute('aria-invalid', 'true');
  await any.getByLabel('Titre').fill('Une');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`)).toHaveText('Une');
});

test('e sur une tâche : fiche ouverte directement en édition, titre sélectionné', async ({ page, store, data }) => {
  await pressDown(page, 3); // « Deux »
  await page.keyboard.press('e');
  const dialog = page.getByRole('dialog', { name: 'Deux' });
  await expect(dialog.getByLabel('Titre')).toBeFocused();
  await dialog.getByLabel('Titre').fill('Deux (modifiée)');
  await dialog.getByLabel('Contenu').focus();
  await page.keyboard.type('Notes rapides');
  await page.keyboard.press('ControlOrMeta+Enter'); // lecture
  await expect(page.getByRole('dialog').locator('.notes-preview')).toHaveText('Notes rapides');
  await page.keyboard.press('ControlOrMeta+Enter'); // fermeture
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(store.state().projects[0].tasks[1]).toMatchObject({ title: 'Deux (modifiée)', notes: 'Notes rapides' });
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('une colonne : le Log, dans son onglet, prend la place des projets (écran large comme étroit)', async ({ page }) => {
  for (const width of [1280, 800]) {
    await page.setViewportSize({ width, height: 600 });
    await reload(page);
    await expect(page.getByRole('tab')).toHaveText(['Projets', 'Aujourd’hui', 'Suivant', 'Log']);
    await expect(page.locator('#journal')).toHaveCount(0);
    const projects = (await page.locator('#projects').boundingBox())!;
    await page.keyboard.press('L');
    const log = (await page.locator('#journal').boundingBox())!;
    expect(Math.abs(log.x - projects.x), `${width}`).toBeLessThan(2);
    expect(Math.abs(log.width - projects.width), `${width}`).toBeLessThan(2);
    await page.keyboard.press('P');
  }
});

test('onglets : chacun garde la position du curseur (L, T ou clic) ; L sur une tâche n’ouvre plus la fiche', async ({ page, store, data }) => {
  const quatre = store.createTask(data.beta.id, 'Quatre');
  const cinq = store.createTask(data.beta.id, 'Cinq');
  store.updateTask(data.tasks.une.id, { doneAt: '2026-09-25' });
  store.updateTask(store.createTask(data.beta.id, 'Faite B').id, { doneAt: '2026-09-25' });
  store.updateTask(data.tasks.trois.id, { dayAt: '2026-09-25' });
  store.updateTask(quatre.id, { dayAt: '2026-09-25' });
  await reload(page);
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });

  // Projets : 3e tâche du 2e projet.
  const onCinq = `task:${cinq.id}`;
  await page.locator(`[data-nav-key="${onCinq}"]`).focus();
  await page.keyboard.press('L');
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0); // plus de fiche sur le ticket
  await page.keyboard.press('End');
  const inLog = await current(page);
  expect(inLog).toMatch(/^task:/);

  await page.keyboard.press('T');
  await expect(tab('Aujourd’hui')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  expect(await current(page)).toBe(`task:${quatre.id}`);

  await page.keyboard.press('P'); // retour aux projets
  await expect(tab('Projets')).toHaveAttribute('aria-selected', 'true');
  expect(await current(page)).toBe(onCinq);
  await page.keyboard.press('L');
  expect(await current(page)).toBe(inLog);
  await page.keyboard.press('P');
  expect(await current(page)).toBe(onCinq);
  await page.keyboard.press('T');
  expect(await current(page)).toBe(`task:${quatre.id}`);
  await tab('Log').click();
  expect(await current(page)).toBe(inLog);
  await tab('Projets').click();
  expect(await current(page)).toBe(onCinq);
});

test('Log : une tâche cochée est barrée ; décochée, elle ne l’est plus', async ({ page }) => {
  await reload(page);
  const inProjects = page.locator('#projects .task .name', { hasText: /^Une$/ });
  await expect(inProjects).not.toHaveCSS('text-decoration-line', 'line-through');
  await inProjects.focus();
  await page.keyboard.press(' ');
  await expect(inProjects).toHaveCount(0);
  await page.keyboard.press('L');
  const inLog = page.locator('#journal .task .name', { hasText: /^Une$/ });
  await expect(inLog).toHaveCSS('text-decoration-line', 'line-through');
  await inLog.focus();
  await page.keyboard.press(' ');
  await expect(inLog).toHaveCount(0);
  await page.keyboard.press('P');
  await expect(page.locator('#projects .task .name', { hasText: /^Une$/ })).not.toHaveCSS('text-decoration-line', 'line-through');
});

test('zone « Log » : un cadre par jour', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { doneAt: '2026-09-20' });
  store.updateTask(data.tasks.deux.id, { doneAt: '2026-09-21' });
  await page.goto('/log');
  const log = page.getByRole('region', { name: 'Log' });
  await expect(page.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
  await log.locator('#log-search').fill('e'); // Une (le 20) et Deux (le 21)
  const days = log.locator('.day');
  await expect(days).toHaveCount(2);
  for (const day of await days.all()) {
    expect(await day.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
  }
});

// --- Annulation (u) ----------------------------------------------------------

test('u annule les actions une à une, U les rejoue ; une nouvelle action efface ce qui pouvait être rejoué', async ({ page, store, data }) => {
  const titles = () => store.state().projects[0].tasks.map((t) => t.title);
  const une = page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`);
  await pressDown(page, 2); // « Une »
  await page.keyboard.press('Enter');
  await page.keyboard.type('Une bis');
  await page.keyboard.press('Enter');
  await expect(une).toHaveText('Une bis');
  await page.keyboard.press(' '); // cochée
  await expect(page.locator('#projects .name', { hasText: 'Une bis' })).toHaveCount(0);

  // u, u : dans l'ordre inverse, focus sur l'élément concerné.
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : tâche cochée');
  await expect(page.locator('#projects .name', { hasText: 'Une bis' })).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : renommage');
  await expect(une).toHaveText('Une');
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Rien à annuler');

  // U, U : rejoue dans l'ordre.
  await page.keyboard.press('U');
  await expect(page.locator('#toast')).toHaveText('Rétabli : renommage');
  await expect(une).toHaveText('Une bis');
  await page.keyboard.press('U');
  await expect(page.locator('#toast')).toHaveText('Rétabli : tâche cochée');
  await expect(page.locator('#projects .name', { hasText: 'Une bis' })).toHaveCount(0);
  await page.keyboard.press('U');
  await expect(page.locator('#toast')).toHaveText('Rien à rétablir');

  // u puis nouvelle action : plus rien à rejouer.
  await page.keyboard.press('u');
  await expect(page.locator('#projects .name', { hasText: 'Une bis' })).toBeVisible();
  await page.locator(`[data-nav-key="task:${data.tasks.deux.id}"]`).focus();
  await page.keyboard.press('2');
  await expect(row(page, data.tasks.deux.id).locator('.priority')).toHaveAttribute('aria-label', 'Priorité 2');
  await page.keyboard.press('U');
  await expect(page.locator('#toast')).toHaveText('Rien à rétablir');
  expect(titles()).toEqual(['Une bis', 'Deux']);
});

test('u / U rapides : les appuis s’enchaînent sans se perdre', async ({ page, store, data }) => {
  await page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`).focus();
  const icon = row(page, data.tasks.une.id).locator('.priority');
  for (const key of ['1', '2', '3']) {
    await page.keyboard.press(key);
    await expect(icon).toHaveAttribute('aria-label', `Priorité ${key}`);
  }
  await page.keyboard.press('u');
  await page.keyboard.press('u');
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : priorité 1');
  await expect(icon).toHaveAttribute('aria-label', 'Priorité');
  expect(store.state().projects[0].tasks[0].priority).toBeNull();
  await page.keyboard.press('U');
  await page.keyboard.press('U');
  await expect(page.locator('#toast')).toHaveText('Rétabli : priorité 2');
  await expect(icon).toHaveAttribute('aria-label', 'Priorité 2');
  expect(store.state().projects[0].tasks[0].priority).toBe(2);
});

test('création annulable : u retire la tâche ou le projet créé, U le rétablit (même identifiant)', async ({ page, store, data }) => {
  const add = page.locator(`[data-nav-key="add:${data.alpha.id}"]`);
  await add.click();
  await page.keyboard.type('Nouvelle');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Nouvelle' })).toBeVisible();
  const id = store.state().projects[0].tasks[2].id;
  await page.keyboard.press('Escape'); // champ en lecture : les raccourcis marchent
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : ajout de la tâche');
  await expect(page.locator('#projects .name', { hasText: 'Nouvelle' })).toHaveCount(0);
  await page.keyboard.press('U');
  await expect(page.locator(`[data-nav-key="task:${id}"]`)).toHaveText('Nouvelle');
  await expect.poll(() => current(page)).toBe(`task:${id}`);

  await page.locator('#new-project').click();
  await page.keyboard.type('Gamma');
  await page.keyboard.press('Enter');
  await expect(page.locator('.project')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : ajout du projet');
  await expect(page.locator('.project')).toHaveCount(2);
  await page.keyboard.press('U');
  await expect(page.locator('.project', { hasText: 'Gamma' })).toHaveCount(1);
});

test('déplacements annulables : tâche et projet reviennent à leur place', async ({ page, store, data }) => {
  await page.locator(`[data-nav-key="task:${data.tasks.deux.id}"]`).focus();
  await page.keyboard.press('Alt+ArrowDown'); // en tête de Beta
  await expect(page.locator(`#project-${data.beta.id} .task .name`)).toHaveText(['Deux', 'Trois']);
  await page.locator(`[data-nav-key="project:${data.beta.id}"]`).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.locator('.project').first()).toHaveId(`project-${data.beta.id}`);
  await page.keyboard.press('u');
  await expect(page.locator('.project').first()).toHaveId(`project-${data.alpha.id}`);
  await page.keyboard.press('u');
  await expect(page.locator(`#project-${data.alpha.id} .task .name`)).toHaveText(['Une', 'Deux']);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
  await page.keyboard.press('U');
  await expect(page.locator(`#project-${data.beta.id} .task .name`)).toHaveText(['Deux', 'Trois']);
  expect(store.state().projects[1].tasks.map((t) => t.title)).toEqual(['Deux', 'Trois']);
});

test('u après une suppression : la tâche revient avec son contenu, sélectionnée', async ({ page, store, data }) => {
  store.updateTask(data.tasks.deux.id, { notes: 'Notes précieuses', bugtracker: 'done', bugtrackerKey: 'PROJ-9' });
  await reload(page);
  await pressDown(page, 3); // « Deux »
  await page.keyboard.press('x');
  await page.keyboard.press('x');
  await expect(page.locator('#projects .name', { hasText: 'Deux' })).toHaveCount(0);
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : suppression');
  await expect(page.locator(`[data-nav-key="task:${data.tasks.deux.id}"]`)).toBeVisible();
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.deux.id}`);
  expect(store.state().projects[0].tasks[1]).toMatchObject({
    id: data.tasks.deux.id,
    title: 'Deux',
    notes: 'Notes précieuses',
    bugtracker_key: 'PROJ-9',
  });
});

test('u dans le Log : décocher puis annuler remet la tâche au même jour', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-20' });
  await page.goto('/log');
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press(' ');
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toHaveCount(0);
  expect(store.state().projects[1].tasks.map((t) => t.title)).toEqual(['Trois']);
  await page.keyboard.press('u');
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toBeVisible();
  expect(store.journal({ projectId: data.beta.id }).days[0].date).toBe('2026-09-20');
});

test('modification dans la fiche annulable : u remet le titre d’avant, U le rétablit', async ({ page, store }) => {
  await pressDown(page, 2);
  await page.keyboard.press('e');
  await page.getByRole('dialog').getByLabel('Titre').fill('Une (fiche)');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const une = page.locator('#projects .task .name').first();
  await expect(une).toHaveText('Une (fiche)');
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : modification de la fiche');
  await expect(une).toHaveText('Une');
  expect(store.state().projects[0].tasks[0].title).toBe('Une');
  await page.keyboard.press('U');
  await expect(une).toHaveText('Une (fiche)');
});

// --- Déplacement de projet ------------------------------------------------------

test('Alt+↑ / Alt+↓ sur un projet : il passe au-dessus du précédent / sous le suivant', async ({ page, store, data }) => {
  const names = () => page.locator('.project-head .name');
  await pressDown(page, 5); // projet « Beta »
  expect(await current(page)).toBe(`project:${data.beta.id}`);
  await page.keyboard.press('Alt+ArrowUp');
  await expect(names()).toHaveText(['Beta', 'Alpha']);
  expect(store.state().projects.map((p) => p.name)).toEqual(['Beta', 'Alpha']);
  expect(await current(page)).toBe(`project:${data.beta.id}`); // le focus suit
  // Ses tâches suivent aussi.
  await expect(page.locator(`#project-${data.beta.id} li.task .name`)).toHaveText(['Trois']);

  await page.keyboard.press('Alt+ArrowUp'); // déjà en haut : rien
  await page.waitForTimeout(200);
  expect(store.state().projects.map((p) => p.name)).toEqual(['Beta', 'Alpha']);

  await page.keyboard.press('Alt+KeyJ'); // comme Alt+↓
  await expect(names()).toHaveText(['Alpha', 'Beta']);
  await reload(page);
  await expect(names()).toHaveText(['Alpha', 'Beta']);
});

test('Maj+↑ / Maj+↓ : en-tête du projet précédent / suivant ; dans un champ, sélection du texte', async ({ page, data }) => {
  const { alpha, beta, tasks } = data;
  await pressDown(page, 3); // « Deux », dans Alpha
  expect(await current(page)).toBe(`task:${tasks.deux.id}`);
  await page.keyboard.press('Shift+ArrowDown');
  expect(await current(page)).toBe(`project:${beta.id}`);
  await page.keyboard.press('Shift+ArrowDown'); // dernier projet : on reste
  expect(await current(page)).toBe(`project:${beta.id}`);
  await page.keyboard.press('ArrowDown'); // « Trois »
  await page.keyboard.press('Shift+ArrowUp');
  expect(await current(page)).toBe(`project:${alpha.id}`);
  // Champ « + Nouveau projet » (hors projet) : Maj+↑ ne quitte pas le champ.
  await page.locator('#new-project').focus();
  await page.keyboard.type('abc');
  await page.keyboard.press('Shift+ArrowUp');
  expect(await current(page)).toBe('new-project');
});

test('Maj+j / Maj+k comme Maj+↓ / Maj+↑ ; en écriture, J et K s’écrivent', async ({ page, data }) => {
  const { alpha, beta, tasks } = data;
  await pressDown(page, 3); // « Deux », dans Alpha
  await page.keyboard.press('Shift+KeyJ');
  expect(await current(page)).toBe(`project:${beta.id}`);
  await page.keyboard.press('j'); // « Trois »
  expect(await current(page)).toBe(`task:${tasks.trois.id}`);
  await page.keyboard.press('Shift+KeyK');
  expect(await current(page)).toBe(`project:${alpha.id}`);
  // « + Ajouter » en lecture : Maj+j navigue ; en écriture, s'écrit.
  const add = page.locator(`[data-nav-key="add:${alpha.id}"]`);
  await pressDown(page, 3);
  expect(await current(page)).toBe(`add:${alpha.id}`);
  await page.keyboard.press('Shift+KeyJ');
  expect(await current(page)).toBe(`project:${beta.id}`);
  await add.click();
  await page.keyboard.type('JK');
  await expect(add).toHaveValue('JK');
  expect(await current(page)).toBe(`add:${alpha.id}`);
});

test('fiche : même disposition en lecture et en édition (titre en haut, icônes dessous)', async ({ page }) => {
  await pressDown(page, 2);
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  // Mesurer après l'animation d'ouverture : pendant, le titre est jusqu'à 12 px
  // plus bas (échec en CI selon la vitesse de la machine).
  await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const readTitle = (await dialog.getByRole('heading', { name: 'Une' }).boundingBox())!;
  const readIcons = (await dialog.locator('.timer').boundingBox())!;
  await page.keyboard.press('e');
  const input = (await dialog.getByLabel('Titre').boundingBox())!;
  const editIcons = (await dialog.locator('.timer').boundingBox())!;
  expect(Math.abs(input.y - readTitle.y)).toBeLessThan(6);
  expect(Math.abs(editIcons.y - readIcons.y)).toBeLessThan(6);
  // Icônes sous le titre, pas à la hauteur de la croix.
  const close = (await dialog.locator('button:has(> span.sr-only)').boundingBox())!;
  expect(editIcons.y).toBeGreaterThan(close.y + close.height);
});

test('Échap Échap : retire tous les filtres (projets et Log) ; un seul Échap ne touche pas aux projets', async ({ page, store, data }) => {
  store.updateProject(data.alpha.id, { favorite: true });
  store.updateTask(data.tasks.une.id, { bugtracker: 'wanted', priority: 1 });
  store.updateProject(store.createProject('Gamma').id, { archived: true });
  store.updateTask(store.createTask(data.beta.id, 'Une ancienne').id, { doneAt: '2026-09-01' });
  store.updateTask(store.createTask(data.beta.id, 'Autre faite').id, { doneAt: '2026-09-02' });
  await page.goto('/log');
  await page.locator('#log-search').fill('Une');
  await expect(page.locator('#journal .name')).toHaveText(['Une ancienne']); // recherche appliquée
  await page.getByRole('tab', { name: 'Projets' }).click();
  await page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`).focus();
  await page.keyboard.press('R');
  await page.keyboard.press('!');
  await page.keyboard.press('F');
  const pressed = (id: string) => page.locator(id);
  for (const id of ['#bugtracker-pending', '#priority-filter', '#favorites-only']) await expect(pressed(id)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('A');
  await expect(pressed('#archived-only')).toHaveAttribute('aria-pressed', 'true');

  // Un Échap : les filtres des projets restent.
  await page.locator('body').press('Escape');
  await expect(pressed('#favorites-only')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('body').press('Escape');
  for (const id of ['#bugtracker-pending', '#priority-filter', '#favorites-only', '#archived-only']) {
    await expect(pressed(id), id).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.locator('#projects .project-head .name')).toHaveText(['Alpha', 'Beta']);
  await page.keyboard.press('L');
  await expect(page.locator('#log-search')).toHaveValue('');
  await expect(page.locator('#journal .name')).toHaveText(['Autre faite', 'Une ancienne']); // plus de recherche
});

// Chromium des tests masque les barres de défilement (pas de décalage visible) :
// on vérifie donc la règle qui réserve leur place.
test('place de la barre de défilement toujours réservée (pas de décalage au filtrage)', async ({ page }) => {
  const gutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
  expect(gutter).toBe('stable');
});

test('aide ? : raccourcis groupés, tout visible sur écran courant, liste qui défile sur petit écran', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await reload(page);
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Raccourcis' });
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['Navigation', 'Fiche', 'Tâche', 'Projet', 'Filtres des projets', 'Log', 'Général']);
  // Raccourcis ajoutés au ménage : déplacement d'un projet, Suppr, fermeture de la fiche.
  await expect(dialog.getByText('Monter / descendre le projet')).toBeVisible();
  await expect(dialog.getByText('Supprimer avec ses tâches (ou Suppr)')).toBeVisible();
  await expect(dialog.getByText('Enregistrer et lire ; en lecture, fermer')).toBeVisible();
  const list = dialog.locator('.overflow-y-auto');
  const fits = () => list.evaluate((e) => e.scrollHeight <= e.clientHeight);
  expect(await fits()).toBe(true);
  // Écran bas : la fenêtre reste dans l'écran, seule la liste défile.
  // Fermeture animée : attendre qu'elle soit finie, sinon ? est ignoré.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  expect(await fits()).toBe(false);
  // Attendre la fin de l'animation d'ouverture.
  await expect.poll(async () => (await dialog.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  const box = (await dialog.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(500);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('filtres des projets sous les onglets, alignés à droite', async ({ page, store, data }) => {
  store.updateProject(data.alpha.id, { favorite: true });
  store.updateTask(data.tasks.une.id, { priority: 1 });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await reload(page);
    const filters = page.getByRole('group', { name: 'Filtres des projets' });
    await expect(filters.getByRole('button')).toHaveCount(2); // Priorités, Favoris
    await expect(page.locator('header #favorites-only')).toHaveCount(0); // plus dans l'en-tête
    const tabs = (await page.getByRole('tablist').boundingBox())!;
    const box = (await filters.boundingBox())!;
    const favorites = (await page.locator('#favorites-only').boundingBox())!;
    const project = (await page.locator('.project').first().boundingBox())!;
    // Sous les onglets (avec un espace), au-dessus des projets, calés à droite de la colonne.
    expect(box.y).toBeGreaterThanOrEqual(tabs.y + tabs.height + 8);
    expect(box.y + box.height).toBeLessThan(project.y);
    expect(Math.round(favorites.x + favorites.width)).toBe(Math.round(project.x + project.width));
  }
});

test('? ouvre l’aide, ? la referme', async ({ page }) => {
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Raccourcis' })).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Raccourcis' })).toBeVisible();
});
