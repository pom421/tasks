import type { Page } from '@playwright/test';
import type { Store } from '../server/db.ts';
import { test as base, expect } from './fixtures.ts';

// Jour figé de la page (voir fixtures.ts) : vendredi 25 septembre 2026.
const TODAY = '2026-09-25';

function seed(store: Store) {
  const alpha = store.createProject('Alpha');
  const beta = store.createProject('Beta');
  return {
    alpha,
    beta,
    une: store.createTask(alpha.id, 'Une'),
    deux: store.createTask(alpha.id, 'Deux'),
    trois: store.createTask(beta.id, 'Trois'),
  };
}

const test = base.extend<{ data: ReturnType<typeof seed> }>({
  data: async ({ store }, use) => use(seed(store)),
});

const row = (page: Page, title: string) => page.locator('li.task', { hasText: title });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const open = async (page: Page, path = '/') => {
  await page.goto(path);
  await expect(page.getByRole('tablist')).toBeVisible();
};
const taskRow = (store: Store, id: number) => store.db.prepare('SELECT day_at, due_at, tags FROM task WHERE id = ?').get(id);

test('fiche : date prévue, échéance et tags (e), étiquettes sur la ligne, u annule', async ({ page, store, data }) => {
  store.updateTask(data.trois.id, { tags: ['client'] }); // tag existant, proposé
  await open(page);
  await page.locator(`[data-nav-key="task:${data.une.id}"]`).focus();
  await page.keyboard.press('e');
  const dialog = page.getByRole('dialog', { name: 'Une' });
  await dialog.getByLabel('Date prévue').fill('2026-09-28');
  await dialog.getByLabel('Échéance').fill('2026-10-12');
  const tags = dialog.getByRole('combobox', { name: 'Tags' });
  await tags.focus();
  await page.keyboard.type('cl');
  await expect(dialog.getByRole('listbox').getByRole('option')).toHaveText(['#client']);
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('option', { name: '#client' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Site Web,'); // tag nouveau, normalisé
  await expect(dialog.locator('.tag-chip')).toHaveText(['client', 'site-web']);
  await dialog.getByRole('button', { name: 'Retirer le tag site-web' }).click();
  await page.keyboard.type('urgent'); // tapé sans valider : gardé à l'enregistrement
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(dialog.locator('.day-value')).toHaveText('lundi 28 septembre 2026');
  await expect(dialog.locator('.due-value')).toHaveText('lundi 12 octobre 2026');
  await expect(dialog.locator('.tags-value')).toHaveText('#client #urgent');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(dialog).toHaveCount(0);

  const une = row(page, 'Une');
  await expect(une.locator('.planned-date')).toHaveText('prévuelun. 28');
  await expect(une.locator('.planned-date')).toHaveAttribute('title', 'Prévue le lundi 28 septembre 2026');
  await expect(une.locator('.due-date')).toHaveText('échéance12 oct.');
  await expect(une.locator('.tags')).toHaveText('#client #urgent');
  expect(taskRow(store, data.une.id)).toEqual({ day_at: '2026-09-28', due_at: '2026-10-12', tags: '["client","urgent"]' });

  // Annulable d'un coup (modification de la fiche).
  await page.keyboard.press('u');
  await expect(une.locator('.planned-date, .due-date, .tags')).toHaveCount(0);
  expect(taskRow(store, data.une.id)).toEqual({ day_at: null, due_at: null, tags: '[]' });
});

test('étiquettes : date prévue du jour masquée (☀), en retard et échéance dépassée en rouge ; rien sur une tâche faite', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { dayAt: TODAY, dueAt: '2026-09-24' });
  store.updateTask(data.deux.id, { dayAt: '2026-09-23' });
  store.updateTask(data.trois.id, { dueAt: '2026-09-26', doneAt: TODAY });
  await open(page);
  const une = row(page, 'Une');
  await expect(une.locator('.planned-date')).toHaveCount(0);
  await expect(une.getByRole('button', { name: 'Pour aujourd’hui' })).toHaveAttribute('aria-pressed', 'true');
  await expect(une.locator('.due-date')).toHaveClass(/late/);
  await expect(une.locator('.due-date')).toHaveAttribute('title', 'Échéance dépassée : jeudi 24 septembre 2026');
  await expect(row(page, 'Deux').locator('.planned-date')).toHaveText('en retard, prévuemer. 23');
  await expect(row(page, 'Deux').locator('.planned-date')).toHaveClass(/late/);
  // Icônes distinctes : calendrier (prévue), réveil (échéance) ; sablier pour la durée (fiche).
  await expect(row(page, 'Deux').locator('.planned-date svg')).toHaveClass(/lucide-calendar-days/);
  await expect(une.locator('.due-date svg')).toHaveClass(/lucide-alarm-clock/);
  await page.keyboard.press('L');
  await expect(page.locator('#journal li.task', { hasText: 'Trois' }).locator('.due-date')).toHaveCount(0);
});

test('Aujourd’hui : ☀ sur une tâche en retard la ramène au jour', async ({ page, store, data }) => {
  store.updateTask(data.deux.id, { dayAt: '2026-09-23' });
  await open(page, '/plan');
  const deux = page.locator('#day .late-tasks li.task', { hasText: 'Deux' });
  await expect(deux).toBeVisible();
  const sun = deux.getByRole('button', { name: 'Pour aujourd’hui' });
  await deux.hover();
  await expect(sun).toHaveAttribute('title', 'Prévoir pour aujourd’hui plutôt (t)');
  await sun.click();
  await expect(page.locator('#day .late-tasks')).toHaveCount(0);
  await expect(page.locator('#day li.task .name')).toHaveText(['Deux']);
  expect(taskRow(store, data.deux.id)).toMatchObject({ day_at: TODAY });
});

test('Prochainement : agenda par jour, tâche à ses deux dates, un cadre rouge par échéance dépassée', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { dayAt: '2026-09-28', dueAt: '2026-10-02' });
  store.updateTask(data.deux.id, { dueAt: '2026-09-20' });
  store.updateTask(data.trois.id, { dayAt: '2026-09-23', dueAt: '2026-09-22' }); // prévue avant : pas ici ; échéance dépassée : ici
  await open(page, '/plan');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(tab(page, 'Prochainement')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/prochainement$/);
  const days = page.locator('#upcoming .upcoming-day');
  await expect(days.locator('h3')).toHaveText([
    'dimanche 20 septembre 2026 (échéance dépassée)',
    'mardi 22 septembre 2026 (échéance dépassée)',
    'lundi 28 septembre 2026',
    'vendredi 2 octobre 2026',
  ]);
  await expect(days.nth(0).locator('h3')).toHaveClass(/text-destructive/);
  await expect(days.nth(2).locator('h3')).not.toHaveClass(/text-destructive/);
  await expect(days.nth(0).locator('li.task .name')).toHaveText(['Deux']);
  await expect(days.nth(1).locator('li.task .name')).toHaveText(['Trois']);
  await expect(days.nth(2).locator('li.task .name')).toHaveText(['Une']);
  await expect(days.nth(3).locator('li.task .name')).toHaveText(['Une']);
  await expect(days.nth(2).locator('.project-label')).toHaveText(['Alpha']);
  // Filtres des projets masqués.
  await expect(page.getByRole('group', { name: 'Filtres des projets' })).toHaveCount(0);

  // Plus de date : message exact.
  for (const t of [data.une, data.deux, data.trois]) store.updateTask(t.id, { dayAt: null, dueAt: null });
  await page.reload();
  await expect(page.locator('#upcoming .empty')).toHaveText('Aucune tâche datée à venir.');
});

test('filtre # des projets : autocomplétion, pastilles ✕, tous les tags requis, message exact, Échap Échap', async ({ page, store, data }) => {
  await open(page);
  // Aucun tag : pas de filtre.
  await expect(page.locator('#project-tags')).toHaveCount(0);
  store.updateTask(data.une.id, { tags: ['client', 'api'] });
  store.updateTask(data.deux.id, { tags: ['client'] });
  await page.reload();
  await expect(page.locator('#project-tags')).toBeVisible();

  await page.keyboard.press('#');
  await expect(page.locator('#project-tags')).toBeFocused();
  await expect(page.locator('#project-tags')).toHaveValue('');
  await page.keyboard.type('cli');
  await page.keyboard.press('Enter'); // meilleure proposition
  const group = page.getByRole('group', { name: 'Filtres des projets' });
  await expect(group.locator('.tag-chip')).toHaveText(['client']);
  await expect(page.locator('#projects li.task .name')).toHaveText(['Une', 'Deux']);

  await page.keyboard.type('a');
  await expect(group.getByRole('option')).toHaveText(['#api']);
  await page.keyboard.press('Enter');
  await expect(page.locator('#projects li.task .name')).toHaveText(['Une']);

  // Tag inconnu dans un filtre : rien d'ajouté.
  await page.keyboard.type('zzz');
  await page.keyboard.press('Enter');
  await expect(group.locator('.tag-chip')).toHaveText(['client', 'api']);
  await page.keyboard.press('Escape'); // vide le champ
  await expect(page.locator('#project-tags')).toHaveValue('');

  // ✕ sur une pastille : retirée du filtre.
  await group.getByRole('button', { name: 'Retirer #api du filtre' }).click();
  await expect(group.locator('.tag-chip')).toHaveText(['client']);
  await expect(page.locator('#projects li.task .name')).toHaveText(['Une', 'Deux']);

  // Plus aucune tâche avec ce tag : filtre actif gardé visible, message exact.
  await page.getByRole('tab', { name: 'Aujourd’hui' }).click();
  store.updateTask(data.une.id, { tags: [] });
  store.updateTask(data.deux.id, { tags: ['autre'] });
  await page.getByRole('tab', { name: 'Projets' }).click();
  await expect(group.locator('.tag-chip')).toHaveText(['client']);
  await expect(page.locator('#projects .empty')).toHaveText('Aucune tâche à faire avec #client.');
  // Combiné à un autre filtre : message générique.
  await page.keyboard.press('F');
  await expect(page.locator('#projects .empty')).toHaveText('Aucune tâche avec les filtres demandés.');

  // Échap Échap : tous les filtres, tags compris.
  await page.locator('body').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(group.locator('.tag-chip')).toHaveCount(0);
  await expect(page.locator('#projects li.task')).toHaveCount(3);
});

test('filtre # du Log : dans l’onglet Log, tâches faites portant tous les tags', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { tags: ['client'], doneAt: TODAY });
  store.updateTask(data.deux.id, { tags: ['interne'], doneAt: TODAY });
  store.updateTask(data.trois.id, { tags: ['projet'] }); // à faire : pas proposé dans le Log
  await open(page, '/log');
  const log = page.locator('#journal');
  await expect(log.locator('li.task .name')).toHaveText(['Une', 'Deux']);
  await page.keyboard.press('#');
  await expect(page.locator('#log-tags')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(log.getByRole('listbox').getByRole('option')).toHaveText(['#client', '#interne']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(log.locator('li.task .name')).toHaveText(['Deux']);
  await expect(page.locator('#log-count')).toHaveText('1 tâche trouvée dans 1 journée');
  // Zones indépendantes : le filtre du Log ne touche pas les projets.
  await page.locator('#log-tags').blur();
  await page.keyboard.press('P');
  await expect(page.locator('#projects li.task .name')).toHaveText(['Trois']);
  await page.keyboard.press('L');
  await log.getByRole('button', { name: 'Réinitialiser les filtres du Log' }).click();
  await expect(log.locator('li.task .name')).toHaveText(['Une', 'Deux']);
});

test('non-régression : # s’écrit dans un champ de saisie ; ☀ et t inchangés', async ({ page, store, data }) => {
  store.updateTask(data.une.id, { tags: ['client'] });
  await open(page);
  await page.locator(`[data-nav-key="add:${data.alpha.id}"]`).click();
  await page.keyboard.type('Ticket #12');
  await expect(page.locator(`[data-nav-key="add:${data.alpha.id}"]`)).toHaveValue('Ticket #12');
  await page.keyboard.press('Escape');
  await page.locator(`[data-nav-key="task:${data.deux.id}"]`).focus();
  await page.keyboard.press('t');
  await expect(row(page, 'Deux').getByRole('button', { name: 'Pour aujourd’hui' })).toHaveAttribute('aria-pressed', 'true');
  expect(taskRow(store, data.deux.id)).toMatchObject({ day_at: TODAY });
});
