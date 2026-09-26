import type { Page } from '@playwright/test';
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
  await expect(page.locator('#journal .name', { hasText: 'Une' })).toBeVisible();
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Deux']);
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('Espace dans le journal décoche la tâche', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-25' });
  await reload(page);
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toBeVisible();
  await page.keyboard.press('End');
  expect(await current(page)).toBe(`task:${data.tasks.trois.id}`);
  await page.keyboard.press(' ');
  await expect(page.locator('#projects .name', { hasText: 'Trois' })).toBeVisible();
  expect(store.state().projects[1].tasks[0].title).toBe('Trois');
});

test('champ d’ajout : on tape directement, Entrée ajoute, Échap vide et sort du champ', async ({ page, store, data }) => {
  await pressDown(page, 4);
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await page.keyboard.type('Quatre');
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects .name', { hasText: 'Quatre' })).toBeVisible();
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('');
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Une', 'Deux', 'Quatre']);

  await page.keyboard.type('brouillon');
  await page.keyboard.press('Escape');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('');
  // Hors du champ, sur la tâche au-dessus : les raccourcis marchent (p = priorité).
  const quatre = store.state().projects[0].tasks[2].id;
  await expect.poll(() => current(page)).toBe(`task:${quatre}`);
  await page.keyboard.press('p');
  await expect(page.locator(`#projects li.task:has([data-nav-key="task:${quatre}"]) button.priority`)).toHaveAttribute('aria-label', 'Priorité 1');
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
  store.updateTask(data.tasks.une.id, { jira: 'wanted', notes: 'du contenu' });
  await reload(page);
  // Première ligne (le titre, porteur de data-nav-key, devient un champ en édition).
  const une = page.locator('#projects li.task').first();
  const box = async (sel: string) => (await une.locator(sel).boundingBox())!;
  const rowBox = (await une.boundingBox())!;
  // Icônes (report, détails, chrono, ☀ Plan journée, puis priorité) collées au bord droit de la ligne.
  const details = await box('.details');
  const timer = await box('.timer');
  const sun = await box('.day-toggle');
  const priority = await box('button.priority');
  expect(rowBox.x + rowBox.width - (priority.x + priority.width)).toBeLessThan(10);
  expect(priority.x - (sun.x + sun.width)).toBeLessThan(10);
  expect(sun.x - (timer.x + timer.width)).toBeLessThan(10);
  expect(timer.x - (details.x + details.width)).toBeLessThan(10);
  expect((await box('.report')).x).toBeGreaterThan(rowBox.x + rowBox.width / 2);

  // Clic à droite du texte, juste avant les icônes : le titre passe en édition.
  const report = await box('.report');
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

test('j / k naviguent comme ↓ / ↑, mais s’écrivent dans un champ', async ({ page, data }) => {
  await page.keyboard.press('j');
  expect(await current(page)).toBe(`project:${data.alpha.id}`);
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  expect(await current(page)).toBe(`task:${data.tasks.deux.id}`);
  await page.keyboard.press('k');
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
  // Dans le champ d'ajout, j et k sont des lettres.
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  expect(await current(page)).toBe(`add:${data.alpha.id}`);
  await page.keyboard.type('jk');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('jk');
});

test('raccourcis actifs même quand le focus est sur la case à cocher', async ({ page, store }) => {
  await page.locator('#projects li.task').first().getByRole('checkbox').focus();
  await page.keyboard.press('Shift+J');
  await expect(page.locator('#projects li.task').first().locator('.report-wanted')).toBeVisible();
  expect(store.state().projects[0].tasks[0].jira_wanted_at).toBeTruthy();
});

test('nouveau projet : le focus va sur la saisie de sa première tâche', async ({ page, store }) => {
  await page.keyboard.press('p');
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
  expect(store.state().projects[0].tasks[0].jira_at).toBeNull();
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
});

test('badge « reporté » conservé dans le journal, et J y fonctionne aussi', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { jira: 'done' });
  await reload(page);
  const row = page.locator(`li.task:has([data-nav-key="task:${data.tasks.trois.id}"])`);
  await expect(row.locator('.report')).toBeVisible();
  await pressDown(page, 6);
  await page.keyboard.press(' ');
  await expect(page.locator(`#journal li.task:has([data-nav-key="task:${data.tasks.trois.id}"]) .report-done`)).toBeVisible();

  // Plus de tâche dans Beta : le focus remonte sur le projet ; descendre jusqu'au Log.
  await pressDown(page, 3);
  expect(await current(page)).toBe(`task:${data.tasks.trois.id}`);
  await page.keyboard.press('Shift+J');
  await expect(row.locator('.report')).toHaveCount(0);
  expect(store.journal({ projectId: data.beta.id }).days[0].tasks[0].jira_at).toBeNull();
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

test('cœur : projet favori (plein, rouge) ; bouton Favoris et * filtrent', async ({ page, store, data }) => {
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

  // * au clavier : bascule le filtre.
  await page.keyboard.press('*');
  await expect(page.locator('.project')).toHaveCount(2);
  await page.keyboard.press('*');
  await expect(page.locator('.project')).toHaveCount(1);
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
  const row = page.locator('#jira-pending, #archived-only, #favorites-only');
  await expect(row).toHaveCount(0); // rien à reporter, ni archivé, ni favori
  store.updateTask(data.tasks.une.id, { jira: 'wanted' });
  const gamma = store.createProject('Gamma');
  store.updateProject(gamma.id, { archived: true });
  store.updateProject(data.beta.id, { favorite: true });
  await reload(page);
  expect(await row.evaluateAll((els) => els.map((e) => e.id))).toEqual(['jira-pending', 'archived-only', 'favorites-only']);

  // Archivés : comme « à reporter », un filtre : seulement les projets archivés.
  const archived = page.locator('#archived-only');
  await expect(archived).toHaveAttribute('aria-pressed', 'false');
  for (const id of ['#jira-pending', '#archived-only', '#favorites-only']) {
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
  store.updateTask(store.createTask(gamma.id, 'G à reporter').id, { jira: 'wanted' });
  store.createTask(gamma.id, 'G normale');
  store.updateProject(gamma.id, { archived: true, favorite: true });
  const delta = store.createProject('Delta');
  store.updateProject(delta.id, { archived: true });
  store.updateProject(data.alpha.id, { favorite: true }); // favori, non archivé
  store.updateTask(data.tasks.trois.id, { jira: 'wanted' }); // Beta : à reporter, non favori
  await reload(page);

  const buttons = page.locator('#jira-pending, #archived-only, #favorites-only');
  const heads = page.locator('#projects .project-head .name');
  const tasks = page.locator('#projects .task .name');
  await expect(page.locator('#jira-pending')).toHaveText('2 tâches à reporter'); // tous projets confondus

  await page.locator('#archived-only').click();
  await expect(heads).toHaveText(['Gamma', 'Delta']);
  await expect(buttons).toHaveCount(3); // Favoris et à reporter restent là
  await page.locator('#favorites-only').click(); // archivés ET favoris
  await expect(heads).toHaveText(['Gamma']);
  await expect(tasks).toHaveText(['G à reporter', 'G normale']);
  await page.locator('#jira-pending').click(); // ET à reporter
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
  await page.locator('#jira-pending').click();

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
  await expect(page.locator('#filter-project')).not.toBeFocused(); // pas le raccourci global
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

// --- Suivi Jira ------------------------------------------------------------

const row = (page: Page, taskId: number) => page.locator(`li.task:has([data-nav-key="task:${taskId}"])`);

test('J fait tourner : à reporter (contour) → reportée (plein, fiche proposée) → rien', async ({ page, store, data }) => {
  const une = row(page, data.tasks.une.id);
  await pressDown(page, 2);
  await page.keyboard.press('Shift+J');
  await expect(une.locator('.report-wanted')).toBeVisible();
  expect(store.state().jiraPending).toBe(1);

  await page.keyboard.press('Shift+J');
  await expect(une.locator('.report-done')).toHaveText('reporté'); // sans identifiant : le mot, visible
  // Fiche proposée sur le champ du ticket ; Échap la ferme et rend le focus à la tâche.
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await expect(dialog.getByLabel('Ticket', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.une.id}`);

  await page.keyboard.press('Shift+J');
  await expect(une.locator('.report')).toHaveCount(0);
  expect(store.state().projects[0].tasks[0]).toMatchObject({ jira_wanted_at: null, jira_at: null, jira_key: null });
});

test('fiche : L sur le ticket, clé + URL Jira d’entreprise = lien cliquable', async ({ page, store, data }) => {
  store.updateSettings({ jira_base_url: 'https://entreprise.atlassian.net' });
  await reload(page);
  await pressDown(page, 2);
  await page.keyboard.press('Shift+L');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await expect(dialog).toHaveAccessibleDescription(/Alpha · à faire/);
  await expect(dialog.getByLabel('Ticket', { exact: true })).toBeFocused();
  await page.keyboard.type('proj-7');
  await expect(dialog).not.toContainText('https://entreprise.atlassian.net'); // lien non répété dans la fiche
  await page.keyboard.press('Enter');

  await expect(dialog).toHaveCount(0);
  const link = row(page, data.tasks.une.id).locator('a.report-link');
  await expect(link).toHaveAttribute('href', 'https://entreprise.atlassian.net/browse/PROJ-7');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveText('reporté · PROJ-7');
  // À l'écran, l'identifiant seul : « reporté » est réservé aux lecteurs d'écran.
  await expect(link.getByText('reporté', { exact: false })).toHaveClass(/sr-only/);
  await expect(link.locator('.report-key')).toHaveText('PROJ-7');
  await expect(row(page, data.tasks.une.id).locator('.report-done')).toBeVisible(); // ticket = reportée
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);
});

test('fiche : identifiant invalide annoncé, la fiche reste ouverte', async ({ page, store }) => {
  await pressDown(page, 2);
  await page.keyboard.press('Shift+L');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await page.keyboard.type('pas un ticket');
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('alert')).toHaveText('Identifiant attendu, ex. PROJ-123');
  await expect(dialog.getByLabel('Ticket', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();
  expect(store.state().projects[0].tasks[0]).toMatchObject({ jira_key: null, jira_url: null });
});

test('fiche Markdown : e édite (titre → Tab → ticket → Tab → contenu), Ctrl+Entrée lecture puis fermeture', async ({ page, store, data }) => {
  await pressDown(page, 3); // « Deux »
  await page.keyboard.press('Shift+Enter');
  const dialog = page.getByRole('dialog', { name: 'Deux' });
  const preview = dialog.locator('.notes-preview');
  await expect(dialog.locator('.reader')).toBeFocused();
  await expect(preview).toHaveText('Aucun contenu.');
  await expect(dialog.locator('.ticket-value')).toHaveText('aucun');

  await page.keyboard.press('e');
  await expect(dialog.getByLabel('Titre')).toBeFocused();
  await expect(dialog.getByLabel('Titre')).toHaveValue('Deux');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Ticket', { exact: true })).toBeFocused();
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

test('réglages (/admin) : URL Jira conservée en base, lien depuis la fiche', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { jira: 'done', jiraKey: 'PROJ-1' });
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
  await page.getByLabel('URL de base des tickets').fill('https://entreprise.atlassian.net/');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByText('Réglages enregistrés.')).toBeVisible();
  expect(store.settings().jira_base_url).toBe('https://entreprise.atlassian.net');

  // Rechargement direct de /admin : valeur relue en base.
  await page.reload();
  await expect(page.getByLabel('URL de base des tickets')).toHaveValue('https://entreprise.atlassian.net');

  // Échap : retour à la page principale.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
  await expect(row(page, data.tasks.une.id).locator('a.report-link')).toHaveAttribute(
    'href',
    'https://entreprise.atlassian.net/browse/PROJ-1',
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

test('compteur « à reporter » : filtre la zone des projets seulement (r ou clic)', async ({ page, store, data }) => {
  store.updateTask(data.tasks.deux.id, { jira: 'wanted' });
  const faite = store.createTask(data.beta.id, 'Faite à reporter');
  store.updateTask(faite.id, { doneAt: '2026-09-25', jira: 'wanted' });
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-25' });
  await reload(page);

  const counter = page.locator('#jira-pending');
  await expect(counter).toHaveText('1 tâche à reporter'); // tâches à faire des projets
  await page.keyboard.press('r');
  await expect(counter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Deux']);
  await expect(page.locator('#journal .name')).toHaveText(['Trois', 'Faite à reporter']); // Log inchangé

  await counter.click();
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une', 'Deux', 'Beta']);
  await expect(page.locator('#journal .name')).toHaveText(['Trois', 'Faite à reporter']);
});

// Non-régression : les boutons sous la barre d'outils ne touchent qu'à la zone des projets.
test('boutons à reporter, Archivés, Favoris : le Log ne change pas', async ({ page, store, data }) => {
  const gamma = store.createProject('Gamma');
  store.updateTask(store.createTask(gamma.id, 'Gamma faite').id, { doneAt: '2026-09-25' });
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-25' });
  store.updateTask(data.tasks.une.id, { jira: 'wanted' });
  store.updateProject(gamma.id, { archived: true });
  store.updateProject(data.alpha.id, { favorite: true });
  await reload(page);

  const log = page.locator('#journal');
  const snapshot = async () => ({
    names: await log.locator('.name').allTextContents(),
    labels: await log.locator('.project-label').allTextContents(),
    count: await page.locator('#log-count').textContent(),
    date: await page.locator('#filter-date').inputValue(),
    options: await page.locator('#filter-project option').allTextContents(),
  });
  const before = await snapshot();
  expect(before.names).toEqual(['Trois', 'Gamma faite']); // tâche d'un projet archivé comprise
  expect(before.options).toEqual(['Tous les projets', 'Alpha', 'Beta', 'Gamma (archivé)']);

  for (const id of ['#jira-pending', '#archived-only', '#favorites-only']) {
    const button = page.locator(id);
    const projects = await page.locator('#projects .project').count();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.locator('#projects .project').count(), id).not.toBe(projects); // la zone des projets change
    expect(await snapshot(), id).toEqual(before); // le Log, non
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  }
  // Au clavier (r, *), combinés.
  await page.keyboard.press('r');
  await page.keyboard.press('*');
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une']);
  expect(await snapshot()).toEqual(before);

  // Et le Log filtré (recherche) ne touche pas à la zone des projets.
  await page.locator('#log-search').fill('Gamma');
  await expect(log.locator('.name')).toHaveText(['Gamma faite']);
  await expect(page.locator('#projects .name')).toHaveText(['Alpha', 'Une']);
});

test('fiche rouverte : contenu relu depuis les données à jour', async ({ page, data }) => {
  await pressDown(page, 2);
  await page.keyboard.press('o');
  await page.keyboard.press('e');
  await page.getByRole('dialog', { name: 'Une' }).getByLabel('Contenu').fill('premier jet');
  await page.keyboard.press('Escape'); // enregistré à la fermeture
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.une.id}`);
  await page.keyboard.press('Shift+J'); // à reporter
  await page.keyboard.press('Shift+J'); // reportée : la fiche s'ouvre sur le ticket
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await expect(dialog.getByLabel('Ticket', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Contenu')).toHaveValue('premier jet'); // relu depuis la base
});

test('bouton « tâches à reporter » : place réservée, rien ne bouge quand il apparaît', async ({ page, data }) => {
  const top = () => page.locator('#projects').evaluate((el) => el.getBoundingClientRect().top);
  await expect(page.locator('#jira-pending')).toHaveCount(0);
  const before = await top();
  await pressDown(page, 2);
  await page.keyboard.press('Shift+J');
  await expect(page.locator('#jira-pending')).toHaveText('1 tâche à reporter');
  expect(await top()).toBe(before);
  await expect(row(page, data.tasks.une.id).locator('.report-wanted')).toHaveText('à reporter');
});

test('titre long : « … » sur une ligne, titre complet au survol ou au focus clavier', async ({ page, store, data }) => {
  const long = 'Préparer la présentation trimestrielle pour le comité de direction avec les chiffres consolidés de toutes les équipes produit';
  store.updateTask(data.tasks.une.id, { title: long, jira: 'done', jiraKey: 'PROJ-1234' });
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

test('ligne épurée et fiche ordonnée : titre, ticket, contenu', async ({ page, data }) => {
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveAttribute('placeholder', '+ Ajouter une tâche (n)');
  const une = row(page, data.tasks.une.id);
  await une.hover();
  await expect(une.locator('.actions button')).toHaveCount(0); // ni « reporté », ni « détails », ni suppression (x x)

  await pressDown(page, 2);
  await page.keyboard.press('Shift+Enter');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await page.keyboard.press('e');
  const labels = await dialog.locator('label').allTextContents();
  expect(labels).toEqual(['Titre', 'Ticket', 'Contenu']);
});

test('fiche : e modifie aussi le titre et le ticket ; Entrée dans un champ = enregistrer', async ({ page, store, data }) => {
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
  await page.keyboard.press('Tab');
  await page.keyboard.type('proj-5');
  await page.keyboard.press('Enter'); // enregistre et repasse en lecture
  const renamed = page.getByRole('dialog', { name: 'Une, renommée', exact: true });
  await expect(renamed.locator('.ticket-value')).toHaveText('PROJ-5');
  expect(store.state().projects[0].tasks[0]).toMatchObject({ title: 'Une, renommée', jira_key: 'PROJ-5' });

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
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Notes rapides');
  await page.keyboard.press('ControlOrMeta+Enter'); // lecture
  await expect(page.getByRole('dialog').locator('.notes-preview')).toHaveText('Notes rapides');
  await page.keyboard.press('ControlOrMeta+Enter'); // fermeture
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(store.state().projects[0].tasks[1]).toMatchObject({ title: 'Deux (modifiée)', notes: 'Notes rapides' });
  await expect.poll(() => current(page)).toBe(`task:${data.tasks.deux.id}`);
});

test('écran large : projets à gauche, Log à droite, toujours visible ; écran étroit : l’un sous l’autre', async ({ page, store, data }) => {
  for (let i = 0; i < 30; i++) store.createTask(data.beta.id, `Tâche ${i}`);
  await page.setViewportSize({ width: 1280, height: 600 });
  await reload(page);
  const projects = (await page.locator('#projects').boundingBox())!;
  const log = (await page.locator('#journal').boundingBox())!;
  expect(log.x).toBeGreaterThan(projects.x + projects.width - 1); // à droite
  // En haut, à la même hauteur : onglet « Projets » en face du titre « Log ».
  const projectsTitle = (await page.getByRole('tab', { name: 'Projets' }).boundingBox())!;
  const logTitle = (await page.locator('#journal').getByRole('heading', { name: 'Log' }).boundingBox())!;
  expect(Math.abs(projectsTitle.y - logTitle.y)).toBeLessThan(2);

  // Tâche cochée tout en bas de la liste : elle apparaît dans le Log, visible sans défiler.
  const last = page.locator('#projects .task .name', { hasText: 'Tâche 29' });
  await last.focus();
  await page.keyboard.press(' ');
  await expect(page.locator('#journal .task .name', { hasText: 'Tâche 29' })).toBeInViewport();

  await page.setViewportSize({ width: 800, height: 600 });
  const narrowProjects = (await page.locator('#projects').boundingBox())!;
  const narrowLog = (await page.locator('#journal').boundingBox())!;
  expect(narrowLog.y).toBeGreaterThan(narrowProjects.y + narrowProjects.height); // dessous
  expect(Math.abs(narrowLog.x - narrowProjects.x)).toBeLessThan(2);
  // Écran étroit : les onglets restent là (seul moyen de changer de vue à la souris).
  await expect(page.getByRole('tab', { name: 'Projets' })).toBeVisible();
});

test('Log : une tâche cochée est barrée ; décochée, elle ne l’est plus', async ({ page }) => {
  await reload(page);
  const inProjects = page.locator('#projects .task .name', { hasText: /^Une$/ });
  await expect(inProjects).not.toHaveCSS('text-decoration-line', 'line-through');
  await inProjects.focus();
  await page.keyboard.press(' ');
  const inLog = page.locator('#journal .task .name', { hasText: /^Une$/ });
  await expect(inLog).toHaveCSS('text-decoration-line', 'line-through');
  await inLog.focus();
  await page.keyboard.press(' ');
  await expect(page.locator('#projects .task .name', { hasText: /^Une$/ })).not.toHaveCSS('text-decoration-line', 'line-through');
});

test('zone « Log » : un cadre par jour', async ({ page, store, data }) => {
  store.updateTask(data.tasks.une.id, { doneAt: '2026-09-20' });
  store.updateTask(data.tasks.deux.id, { doneAt: '2026-09-21' });
  await reload(page);
  const log = page.getByRole('region', { name: 'Log' });
  await expect(log.getByRole('heading', { name: 'Log' })).toBeVisible();
  await log.locator('#log-search').fill('e'); // Une (le 20) et Deux (le 21)
  const days = log.locator('.day');
  await expect(days).toHaveCount(2);
  for (const day of await days.all()) {
    expect(await day.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
  }
});

// --- Annulation (u) ----------------------------------------------------------

test('u annule la dernière action : cocher, puis renommer ; une seule fois', async ({ page, store, data }) => {
  await pressDown(page, 2); // « Une »
  await page.keyboard.press(' ');
  await expect(page.locator('#journal .name', { hasText: 'Une' })).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Annulé : tâche cochée');
  await expect(page.locator('#projects .name', { hasText: 'Une' })).toBeVisible();
  expect(store.state().projects[0].tasks.map((t) => t.title)).toEqual(['Une', 'Deux']);
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`); // focus restauré

  await page.keyboard.press('Enter');
  await page.keyboard.type('Une bis');
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`)).toHaveText('Une bis');
  await page.keyboard.press('u');
  await expect(page.locator(`[data-nav-key="task:${data.tasks.une.id}"]`)).toHaveText('Une');
  expect(await current(page)).toBe(`task:${data.tasks.une.id}`);

  // Seule la dernière action est annulable.
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Rien à annuler');
  expect(store.state().projects[0].tasks[0].title).toBe('Une');
});

test('u après une suppression : la tâche revient avec son contenu, sélectionnée', async ({ page, store, data }) => {
  store.updateTask(data.tasks.deux.id, { notes: 'Notes précieuses', jira: 'done', jiraKey: 'PROJ-9' });
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
    jira_key: 'PROJ-9',
  });
});

test('u dans le Log : décocher puis annuler remet la tâche au même jour', async ({ page, store, data }) => {
  store.updateTask(data.tasks.trois.id, { doneAt: '2026-09-20' });
  await reload(page);
  await page.getByRole('button', { name: 'Jour précédent' }).click(); // Log sur le 20
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press(' ');
  await expect(page.locator('#projects .name', { hasText: 'Trois' })).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.locator('#journal .name', { hasText: 'Trois' })).toBeVisible();
  expect(store.journal({ projectId: data.beta.id }).days[0].date).toBe('2026-09-20');
});

test('les modifications faites dans la fiche ne sont pas annulables', async ({ page, store }) => {
  await pressDown(page, 2);
  await page.keyboard.press('e');
  await page.getByRole('dialog').getByLabel('Titre').fill('Une (fiche)');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('u');
  await expect(page.locator('#toast')).toHaveText('Rien à annuler');
  expect(store.state().projects[0].tasks[0].title).toBe('Une (fiche)');
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
