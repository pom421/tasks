import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// Journée des tests (horloge du navigateur fixée par fixtures.ts).
const TODAY = '2026-09-25';

const reminder = (page: Page, projectId: number) => page.locator(`#project-${projectId} .summary-reminder`);

test('cercle : seulement si une tâche du projet est faite aujourd’hui ; vide puis plein une fois la synthèse mise à jour', async ({
  page,
  store,
}) => {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  const faite = store.createTask(alpha.id, 'Faite aujourd’hui');
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
  await expect(circle).toHaveAttribute('title', 'Synthèse à mettre à jour : une tâche du projet faite aujourd’hui (s)');
  await expect(circle.locator('svg')).toHaveAttribute('fill', 'none');
  void faite;

  // Clic : la synthèse s'ouvre en édition ; écrire et fermer : le cercle se remplit et reste.
  await circle.click();
  const dialog = page.getByRole('dialog', { name: 'Alpha' });
  const summary = dialog.getByLabel('Synthèse');
  await expect(summary).toBeFocused();
  await summary.fill('## Le projet\nUn essai');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+Enter');
  await expect(dialog).toHaveCount(0);
  await expect(circle).toHaveAttribute('aria-label', 'Synthèse à jour');
  await expect(circle.locator('svg')).toHaveAttribute('fill', 'currentColor');
  expect(store.db.prepare('SELECT day, content FROM project_summary WHERE project_id = ?').all(alpha.id)).toEqual([
    { day: TODAY, content: '## Le projet\nUn essai' },
  ]);

  // u : la synthèse revient à vide, sans version ; le cercle se vide (il reste : tâche faite).
  await page.keyboard.press('u');
  await expect(circle.locator('svg')).toHaveAttribute('fill', 'none');
  expect(store.db.prepare('SELECT COUNT(*) AS n FROM project_summary').get()).toEqual({ n: 0 });
});

test('s sur un projet : synthèse en édition ; boutons d’insertion (faites depuis la version d’avant, P1) en liens', async ({
  page,
  store,
}) => {
  const alpha = store.createProject('Alpha');
  store.updateProject(alpha.id, { notes: 'Ancienne', day: '2026-09-20' });
  const old = store.createTask(alpha.id, 'Faite avant la version');
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
  const summary = dialog.getByLabel('Synthèse');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveValue('Ancienne');

  await summary.press('End');
  await dialog.getByRole('button', { name: 'Tâches faites (1)' }).click();
  await dialog.getByRole('button', { name: 'Priorités 1 (1)' }).click();
  await expect(summary).toHaveValue(
    `Ancienne\n- [Faite \\[récente\\]](#tache-${recent.id})\n- [Urgente](#tache-${p1.id})\n`,
  );

  // En lecture : liens ; un clic ouvre la fiche de la tâche (faite, hors de la fenêtre du Log comprise).
  await page.keyboard.press('Control+Enter');
  const link = dialog.locator('.notes-preview a', { hasText: 'Faite [récente]' });
  await expect(link).toHaveAttribute('href', `#tache-${recent.id}`);
  await expect(link).not.toHaveAttribute('target', '_blank');
  await link.click();
  await expect(page.getByRole('dialog', { name: 'Faite [récente]' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Alpha' })).toHaveCount(0);
});

test('versions : une par jour ; consulter une version passée, la restaurer (u annule)', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  store.updateProject(alpha.id, { notes: 'Lundi', day: '2026-09-21' });
  store.updateProject(alpha.id, { notes: 'Mardi', day: '2026-09-22' });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: 'Alpha' });
  const preview = dialog.locator('.notes-preview');
  await expect(preview).toHaveText('Mardi');
  const version = dialog.getByLabel('Synthèse');
  await expect(version.locator('option')).toHaveText(['mardi 22 septembre 2026 (actuelle)', 'lundi 21 septembre 2026']);
  await expect(dialog.getByRole('button', { name: 'Restaurer cette version' })).toHaveCount(0);

  await version.selectOption({ label: 'lundi 21 septembre 2026' });
  await expect(preview).toHaveText('Lundi');
  await dialog.getByRole('button', { name: 'Restaurer cette version' }).click();
  await expect(preview).toHaveText('Lundi');
  await page.keyboard.press('Control+Enter'); // fermer
  await expect(dialog).toHaveCount(0);
  expect(store.db.prepare('SELECT day, content FROM project_summary ORDER BY day').all()).toEqual([
    { day: '2026-09-21', content: 'Lundi' },
    { day: '2026-09-22', content: 'Mardi' },
    { day: TODAY, content: 'Lundi' },
  ]);
  await page.keyboard.press('u');
  await expect.poll(() => store.db.prepare('SELECT COUNT(*) AS n FROM project_summary').get()).toEqual({ n: 2 });
});

test('non-régression : sans tâche faite aujourd’hui, pas de cercle ; s dans un champ s’écrit', async ({
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
});
