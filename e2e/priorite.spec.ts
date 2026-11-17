import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

const row = (page: Page, title: string) => page.locator('#projects li.task', { hasText: title });
const icon = (page: Page, title: string) => row(page, title).locator('button.priority');

test('clavier : 1 / 2 / 3 donnent la priorité, le même chiffre la retire, u annule', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.createTask(alpha.id, 'Deux');
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // sur « Une »

  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité');
  await page.keyboard.press('2');
  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité 2');
  await expect(icon(page, 'Une')).toHaveClass(/text-amber-500/);
  await page.keyboard.press('1');
  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité 1');
  await expect(icon(page, 'Une')).toHaveClass(/text-red-600/);
  await page.keyboard.press('3');
  await expect(icon(page, 'Une')).toHaveClass(/text-sky-600/);
  await expect(icon(page, 'Une').locator('text')).toHaveText('3');
  // Même chiffre : retirée ; u : rétablie.
  await page.keyboard.press('3');
  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité');
  // Sans priorité : « 1 » dans un carré vide (ce que donne un clic), pas une case vide.
  await expect(icon(page, 'Une').locator('text')).toHaveText('1');
  await expect(icon(page, 'Une').locator('rect')).toHaveAttribute('fill', 'none');
  await page.keyboard.press('u');
  await expect(icon(page, 'Une')).toHaveAttribute('aria-label', 'Priorité 3');
  expect(store.db.prepare('SELECT priority FROM task WHERE id = ?').get(une.id)).toEqual({ priority: 3 });

  // À droite, juste avant le chrono, visible sans survol quand elle est donnée ; sinon au survol seulement.
  await page.mouse.move(0, 0);
  await page.locator('#new-project').focus();
  await expect(icon(page, 'Une')).toBeVisible();
  await expect(icon(page, 'Deux')).toBeHidden();
  const box = (await icon(page, 'Une').boundingBox())!;
  const timer = (await row(page, 'Une').locator('.timer').boundingBox())!;
  expect(timer.x - (box.x + box.width)).toBeLessThan(10);
  await expect(row(page, 'Une').locator('.name')).toHaveText('Une');
});

test('souris : clic sur l’icône, aucune → 1 → 2 → 3 → aucune', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  store.createTask(alpha.id, 'Une');
  await page.goto('/');
  await row(page, 'Une').hover();
  for (const label of ['Priorité 1', 'Priorité 2', 'Priorité 3', 'Priorité']) {
    await icon(page, 'Une').click();
    await expect(icon(page, 'Une')).toHaveAttribute('aria-label', label);
  }
});

test('fiche : même icône, mêmes touches', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { priority: 2 });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  const button = dialog.locator('button.priority');
  await expect(button).toHaveAttribute('aria-label', 'Priorité 2');
  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Priorité 3');

  await dialog.locator('.reader').focus();
  await page.keyboard.press('1');
  await expect(button).toHaveAttribute('aria-label', 'Priorité 1');
  await page.keyboard.press('1');
  await expect(button).toHaveAttribute('aria-label', 'Priorité');

  // En édition, les chiffres s'écrivent dans le champ.
  await page.keyboard.press('e');
  await page.keyboard.press('End');
  await page.keyboard.press('2');
  await expect(dialog.getByLabel('Titre')).toHaveValue('Une2');
  await expect(button).toHaveAttribute('aria-label', 'Priorité');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row(page, 'Une2')).toBeVisible();
});

test('non-régression : priorité gardée dans le Log ; n n sur une tâche = nouveau projet', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.createTask(alpha.id, 'Deux');
  store.updateTask(une.id, { priority: 1, doneAt: '2026-09-25' });
  await page.goto('/log');
  await expect(page.locator('.day li.task', { hasText: 'Une' }).locator('button.priority')).toHaveAttribute('aria-label', 'Priorité 1');
  await page.keyboard.press('P'); // onglet Projets
  await row(page, 'Deux').locator('.name').focus();
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await expect(page.locator('#new-project')).toBeFocused();
});

test('! : filtre priorité 1 → 2 → 3 → toutes (zone des projets seulement)', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  const ids = {
    un: store.createTask(alpha.id, 'Urgent').id,
    deux: store.createTask(alpha.id, 'Important').id,
    sans: store.createTask(alpha.id, 'Sans').id,
    trois: store.createTask(beta.id, 'Plus tard').id,
  };
  store.updateTask(ids.un, { priority: 1 });
  store.updateTask(ids.deux, { priority: 2 });
  store.updateTask(ids.trois, { priority: 3, bugtracker: 'wanted' });
  store.updateTask(store.createTask(beta.id, 'Faite').id, { priority: 1, doneAt: '2026-09-25' });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(2);
  const names = page.locator('#projects .name');
  const button = page.locator('#priority-filter');
  await expect(button).toHaveText('Priorités');
  await expect(button).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('!');
  await expect(button).toHaveText('Priorité 1');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(names).toHaveText(['Alpha', 'Urgent']);
  await page.keyboard.press('L');
  await expect(page.locator('#journal .name')).toHaveText(['Faite']); // Log inchangé
  await page.keyboard.press('P'); // retour aux projets : filtre gardé
  await expect(button).toHaveText('Priorité 1');
  await page.keyboard.press('!');
  await expect(names).toHaveText(['Alpha', 'Important']);
  await button.click();
  await expect(button).toHaveText('Priorité 3');
  await expect(names).toHaveText(['Beta', 'Plus tard']);

  // Combiné en ET avec le report : priorité 3 et à reporter.
  await page.keyboard.press('R');
  await expect(names).toHaveText(['Beta', 'Plus tard']);
  await page.keyboard.press('R'); // reportées : aucune
  await expect(page.locator('#projects .empty')).toHaveText('Aucune tâche avec les filtres demandés.');
  await page.keyboard.press('R');

  await page.keyboard.press('!');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(names).toHaveText(['Alpha', 'Urgent', 'Important', 'Sans', 'Beta', 'Plus tard']);
});

test('! : message exact si aucune tâche de cette priorité ; bouton absent sans priorité', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await expect(page.locator('#priority-filter')).toHaveCount(0);

  store.updateTask(une.id, { priority: 2 });
  await page.reload();
  await page.locator('body').press('!');
  await expect(page.locator('#projects .empty')).toHaveText('Aucune tâche à faire de priorité 1.');
  // Filtre actif : bouton toujours là pour le couper, même si la priorité disparaît.
  store.updateTask(une.id, { priority: null });
  await page.locator('body').press('!');
  await page.locator('body').press('!');
  await expect(page.locator('#priority-filter')).toHaveText('Priorité 3');
});

// Tri par priorité d'un projet : bouton souris seulement, sans touche.
test('projet : bouton « Trier par priorité » : 1, 2, 3, puis sans priorité ; u annule', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const [a, b, c, d] = ['Sans', 'Trois', 'Un', 'Deux'].map((t) => store.createTask(alpha.id, t));
  store.updateTask(b.id, { priority: 3 });
  store.updateTask(c.id, { priority: 1 });
  store.updateTask(d.id, { priority: 2 });
  void a;
  await page.goto('/');
  const names = page.locator('#projects li.task .name');
  await expect(names).toHaveText(['Sans', 'Trois', 'Un', 'Deux']);

  const project = page.locator(`#project-${alpha.id}`);
  await project.locator('.project-head').hover();
  const sort = project.getByRole('button', { name: 'Trier par priorité' });
  await expect(sort).toBeVisible();
  await expect(sort).toHaveAttribute('title', /1, 2, 3, puis sans priorité/);
  await sort.click();
  await expect(names).toHaveText(['Un', 'Deux', 'Trois', 'Sans']);

  // Déjà trié : le bouton ne sert plus (sa place reste, invisible).
  await project.locator('.project-head').hover();
  await expect(sort).toBeHidden();

  // u rend l'ordre d'avant, U le retrie.
  await page.keyboard.press('u');
  await expect(names).toHaveText(['Sans', 'Trois', 'Un', 'Deux']);
  await page.keyboard.press('U');
  await expect(names).toHaveText(['Un', 'Deux', 'Trois', 'Sans']);
});

test('tri par priorité : stable à priorité égale ; ignore les tâches faites et les autres projets', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  const [x, y, z] = ['X', 'Y', 'Z'].map((t) => store.createTask(alpha.id, t));
  store.updateTask(x.id, { priority: 2 });
  store.updateTask(y.id, { priority: 2 });
  store.updateTask(z.id, { priority: 1 });
  store.updateTask(store.createTask(alpha.id, 'Faite').id, { doneAt: '2026-09-25' });
  store.createTask(beta.id, 'Autre');
  await page.goto('/');
  await page.locator(`#project-${alpha.id} .project-head`).hover();
  await page.locator(`#project-${alpha.id}`).getByRole('button', { name: 'Trier par priorité' }).click();
  await expect(page.locator(`#project-${alpha.id} li.task .name`)).toHaveText(['Z', 'X', 'Y']); // X avant Y comme avant
  await expect(page.locator(`#project-${beta.id} li.task .name`)).toHaveText(['Autre']);
  // Beta : aucune priorité, rien à trier.
  await page.locator(`#project-${beta.id} .project-head`).hover();
  await expect(page.locator(`#project-${beta.id}`).getByRole('button', { name: 'Trier par priorité' })).toBeHidden();
});

test('tri par priorité : sans effet quand un filtre de tâches est actif', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const [a, b] = ['Un', 'Deux'].map((t) => store.createTask(alpha.id, t));
  store.updateTask(a.id, { priority: 2 });
  store.updateTask(b.id, { priority: 1 });
  await page.goto('/');
  await page.locator(`#project-${alpha.id} .project-head`).hover();
  await expect(page.locator(`#project-${alpha.id}`).getByRole('button', { name: 'Trier par priorité' })).toBeVisible();
  await page.keyboard.press('!'); // filtre priorité 1 : liste incomplète
  await expect(page.locator('#priority-filter')).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`#project-${alpha.id} .project-head`).hover();
  await expect(page.locator(`#project-${alpha.id}`).getByRole('button', { name: 'Trier par priorité' })).toBeHidden();
});
