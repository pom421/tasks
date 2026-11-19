import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// Journée des tests (horloge du navigateur fixée par fixtures.ts).
const TODAY = '2026-09-25';

const reminder = (page: Page, projectId: number) => page.locator(`#project-${projectId} .summary-reminder`);

test('cercle : seulement si une tâche du projet est faite aujourd’hui ; vide puis plein une fois le bilan du jour écrit', async ({
  page,
  store,
}) => {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  store.createTask(alpha.id, 'Faite aujourd’hui');
  store.createTask(alpha.id, 'À faire');
  store.updateTask(store.createTask(beta.id, 'Faite hier').id, { doneAt: '2026-09-24' });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(2);
  await expect(reminder(page, alpha.id)).toHaveCount(0);
  await expect(reminder(page, beta.id)).toHaveCount(0); // faite un autre jour

  // Cocher une tâche : le cercle apparaît, vide.
  await page.locator('#projects li.task', { hasText: 'Faite aujourd’hui' }).getByRole('checkbox').click();
  const circle = reminder(page, alpha.id);
  await expect(circle).toHaveAttribute('aria-label', 'Synthèse à mettre à jour');
  await expect(circle).toHaveAttribute(
    'title',
    'Synthèse à mettre à jour : une tâche du projet faite aujourd’hui, pas encore de bilan du jour (s)',
  );
  await expect(circle.locator('svg')).toHaveAttribute('fill', 'none');

  // Clic : le bilan du jour s'ouvre en édition ; écrire et fermer : le cercle se remplit et reste.
  await circle.click();
  const dialog = page.getByRole('dialog', { name: 'Alpha' });
  const done = dialog.getByLabel('Fait dernièrement');
  await expect(done).toBeFocused();
  await expect(dialog.locator('.review-day')).toHaveText('Bilan du vendredi 25 septembre 2026');
  await done.fill('Un essai');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Enter');
  await expect(dialog).toHaveCount(0);
  await expect(circle).toHaveAttribute('aria-label', 'Synthèse à jour');
  await expect(circle.locator('svg')).toHaveAttribute('fill', 'currentColor');
  expect(store.db.prepare('SELECT day, done, next FROM project_review WHERE project_id = ?').all(alpha.id)).toEqual([
    { day: TODAY, done: 'Un essai', next: '' },
  ]);

  // u : le bilan du jour disparaît ; le cercle se vide (il reste : tâche faite).
  await page.keyboard.press('u');
  await expect(circle.locator('svg')).toHaveAttribute('fill', 'none');
  expect(store.db.prepare('SELECT COUNT(*) AS n FROM project_review').get()).toEqual({ n: 0 });
});

test('s : bilan du jour ; ajouter les dernières tâches (depuis le bilan d’avant) et les P1, en liens ; retour à la synthèse', async ({
  page,
  store,
}) => {
  const alpha = store.createProject('Alpha');
  store.updateProject(alpha.id, { notes: 'Le projet' });
  store.saveReview(alpha.id, { day: '2026-09-20', done: 'Avant', next: 'Plus tard' });
  const old = store.createTask(alpha.id, 'Faite avant le bilan');
  store.updateTask(old.id, { doneAt: '2026-09-19' });
  const recent = store.createTask(alpha.id, 'Faite [récente]');
  store.updateTask(recent.id, { doneAt: '2026-09-24' });
  const p1 = store.createTask(alpha.id, 'Urgente');
  store.updateTask(p1.id, { priority: 1 });
  store.createTask(alpha.id, 'Normale');
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown'); // en-tête d'Alpha
  await page.keyboard.press('s');
  const dialog = page.getByRole('dialog', { name: 'Alpha' });
  const done = dialog.getByLabel('Fait dernièrement');
  const next = dialog.getByLabel('Bientôt');
  // Nouveau bilan, vide ; les repères ne changent pas.
  await expect(done).toBeFocused();
  await expect(done).toHaveValue('');
  await expect(dialog.getByLabel('Repères')).toHaveCount(0); // repliés

  const addDone = dialog.getByRole('button', { name: 'Ajouter les dernières tâches (1)' });
  const addNext = dialog.getByRole('button', { name: 'Ajouter les prochaines tâches prioritaires (1)' });
  await addDone.click();
  await expect(done).toHaveValue(`- [Faite \\[récente\\]](#tache-${recent.id})\n`);
  await expect(addDone).toHaveCount(0); // déjà dans la zone
  await addNext.click();
  await expect(next).toHaveValue(`- [Urgente](#tache-${p1.id})\n`);
  await expect(addNext).toHaveCount(0);

  // En lecture : liens ; un clic ouvre la fiche de la tâche (faite, hors de la fenêtre du Log comprise).
  await page.keyboard.press('Control+Enter');
  await expect(dialog.locator('.review-day')).toHaveText('Bilan du vendredi 25 septembre 2026');
  const link = dialog.locator('.done-preview a', { hasText: 'Faite [récente]' });
  await expect(link).toHaveAttribute('href', `#tache-${recent.id}`);
  await expect(link).not.toHaveAttribute('target', '_blank');
  await link.click();
  const task = page.getByRole('dialog', { name: 'Faite [récente]' });
  await expect(task).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Alpha' })).toHaveCount(0);

  // « Retour à la synthèse » : la synthèse revient, sur le même bilan.
  await task.getByRole('button', { name: 'Retour à la synthèse' }).click();
  await expect(task).toHaveCount(0);
  await expect(dialog.locator('.review-day')).toHaveText('Bilan du vendredi 25 septembre 2026');
  await expect(dialog.locator('.reader')).toBeFocused();

  // Retour arrière : pareil ; depuis le bilan d'avant, on revient sur lui.
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('.review-day')).toHaveText('Bilan du dimanche 20 septembre 2026');
  await page.keyboard.press('ArrowRight');
  await dialog.locator('.next-preview a', { hasText: 'Urgente' }).click();
  await expect(page.getByRole('dialog', { name: 'Urgente' })).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(dialog.locator('.review-day')).toHaveText('Bilan du vendredi 25 septembre 2026');
  expect(store.db.prepare('SELECT day, done, next FROM project_review ORDER BY day').all()).toEqual([
    { day: '2026-09-20', done: 'Avant', next: 'Plus tard' },
    { day: TODAY, done: `- [Faite \\[récente\\]](#tache-${recent.id})`, next: `- [Urgente](#tache-${p1.id})` },
  ]);
});

test('bilans : ← → et flèches ; repères toujours là ; bilan passé modifiable (u annule) ; nouveau bilan vide non gardé', async ({
  page,
  store,
}) => {
  const alpha = store.createProject('Alpha');
  store.updateProject(alpha.id, { notes: 'Repères du projet' });
  store.saveReview(alpha.id, { day: '2026-09-21', done: 'Lundi', next: 'Mardi ?' });
  store.saveReview(alpha.id, { day: '2026-09-22', done: 'Mardi', next: 'Mercredi ?' });
  const done = store.createTask(alpha.id, 'Faite le 22');
  store.updateTask(done.id, { doneAt: '2026-09-22' });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Alpha' });
  const day = dialog.locator('.review-day');
  const previous = dialog.getByRole('button', { name: 'Bilan précédent' });
  const following = dialog.getByRole('button', { name: 'Bilan suivant' });
  // Le plus récent d'abord.
  await expect(day).toHaveText('Bilan du mardi 22 septembre 2026');
  await expect(dialog.locator('.done-preview')).toHaveText('Mardi');
  await expect(dialog.locator('.next-preview')).toHaveText('Mercredi ?');
  await expect(following).toBeDisabled();

  await page.keyboard.press('ArrowLeft');
  await expect(day).toHaveText('Bilan du lundi 21 septembre 2026');
  await expect(dialog.locator('.done-preview')).toHaveText('Lundi');
  await page.keyboard.press('r');
  await expect(dialog.locator('.notes-preview')).toHaveText('Repères du projet');
  await expect(previous).toBeDisabled();
  await following.click();
  await expect(day).toHaveText('Bilan du mardi 22 septembre 2026');
  await previous.click();
  await expect(day).toHaveText('Bilan du lundi 21 septembre 2026');

  // Bilan passé : modifiable ; premier bilan : pas de tâche à ajouter.
  await dialog.locator('.done-preview').dblclick();
  const doneField = dialog.getByLabel('Fait dernièrement');
  await expect(doneField).toBeFocused();
  await expect(dialog.getByRole('button', { name: /Ajouter les dernières tâches/ })).toHaveCount(0);
  await doneField.fill('Lundi modifié');
  await page.keyboard.press('Control+Enter');
  await expect(dialog.locator('.done-preview')).toHaveText('Lundi modifié');
  // Le bilan suivant propose ses tâches (faites depuis le 21).
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('e');
  await expect(dialog.getByRole('button', { name: 'Ajouter les dernières tâches (1)' })).toBeVisible();
  await page.keyboard.press('Control+Enter');

  // Nouveau bilan : daté d'aujourd'hui, vide ; Échap sans rien écrire : pas gardé.
  await dialog.getByRole('button', { name: 'Nouveau bilan' }).click();
  await expect(day).toHaveText('Bilan du vendredi 25 septembre 2026');
  await expect(dialog.getByLabel('Fait dernièrement')).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Nouveau bilan' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(store.db.prepare('SELECT day, done FROM project_review ORDER BY day').all()).toEqual([
    { day: '2026-09-21', done: 'Lundi modifié' },
    { day: '2026-09-22', done: 'Mardi' },
  ]);

  // u : le bilan passé revient.
  await page.keyboard.press('u');
  await expect
    .poll(() => store.db.prepare("SELECT done FROM project_review WHERE day = '2026-09-21'").get())
    .toEqual({ done: 'Lundi' });
});

test('repères repliés par défaut : 📌 plein si remplis, r ou clic les déplie ; zones l’une sous l’autre ; corps qui défile', async ({
  page,
  store,
}) => {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  store.updateProject(alpha.id, { notes: 'Le projet' });
  const long = Array.from({ length: 40 }, (_, i) => `- Point ${i + 1}`).join('\n');
  store.saveReview(alpha.id, { day: '2026-09-22', done: long, next: 'Ensuite' });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Alpha' });
  const toggle = dialog.getByRole('button', { name: 'Repères' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('title', 'Déplier les repères (r)');
  await expect(toggle.locator('svg.notes-filled')).toHaveAttribute('fill', 'currentColor'); // remplis
  await expect(dialog.locator('.notes-preview')).toHaveCount(0);

  // r déplie (le bilan descend), r replie ; le clic aussi.
  const bilanTop = async () => (await dialog.locator('.review-header').boundingBox())!.y;
  const before = await bilanTop();
  await page.keyboard.press('r');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.locator('.notes-preview')).toHaveText('Le projet');
  expect(await bilanTop()).toBeGreaterThan(before);
  await page.keyboard.press('r');
  await expect(dialog.locator('.notes-preview')).toHaveCount(0);
  await toggle.click();
  await expect(dialog.locator('.notes-preview')).toBeVisible();

  // « Fait dernièrement » au-dessus de « Bientôt », pleine largeur ; la fenêtre reste dans l'écran, le corps défile.
  const done = (await dialog.locator('.done-preview').boundingBox())!;
  const next = (await dialog.locator('.next-preview').boundingBox())!;
  expect(next.y).toBeGreaterThan(done.y + done.height);
  expect(Math.abs(next.x - done.x)).toBeLessThan(2);
  expect((await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height).toBeLessThanOrEqual(700);
  expect(await dialog.locator('.reader').evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  // En-tête des bilans : reste visible en haut quand le corps défile.
  await dialog.locator('.reader').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(dialog.locator('.review-day')).toBeInViewport();
  await page.keyboard.press('Escape');

  // Repères vides : 📌 vide, « (vides) » dans le titre.
  await page.locator(`#project-${beta.id} .project-head .name`).focus();
  await page.keyboard.press('o');
  const empty = page.getByRole('dialog', { name: 'Beta' }).getByRole('button', { name: 'Repères (vides)' });
  await expect(empty.locator('svg.notes-filled')).toHaveAttribute('fill', 'none');
  await expect(empty).toHaveAttribute('title', 'Déplier les repères (vides) (r)');
});

test('non-régression : sans tâche faite aujourd’hui, pas de cercle ; s dans un champ s’écrit ; pas de retour hors synthèse', async ({
  page,
  store,
}) => {
  const alpha = store.createProject('Alpha');
  store.createTask(alpha.id, 'Une');
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await expect(reminder(page, alpha.id)).toHaveCount(0);
  await page.keyboard.press('n'); // champ d'ajout
  await page.keyboard.type('s');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Fiche d'une tâche ouverte depuis la liste : pas de « Retour à la synthèse », Retour arrière sans effet.
  await page.locator('#projects li.task .name', { hasText: 'Une' }).focus();
  await page.keyboard.press('o');
  const task = page.getByRole('dialog', { name: 'Une' });
  await expect(task).toBeVisible();
  await expect(task.getByRole('button', { name: 'Retour à la synthèse' })).toHaveCount(0);
  await page.keyboard.press('Backspace');
  await expect(task).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Alpha' })).toHaveCount(0);
});
