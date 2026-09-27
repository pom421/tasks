import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// Tâches faites sur 8 jours (21 : deux tâches), dans Alpha ; jours vides entre.
const DONE = [
  ['Quatorze', '2026-09-14'], ['Quinze', '2026-09-15'], ['Seize', '2026-09-16'], ['Dix-huit', '2026-09-18'],
  ['Vingt', '2026-09-20'], ['Vingt et un A', '2026-09-21'], ['Vingt et un B', '2026-09-21'],
  ['Vingt-trois', '2026-09-23'], ['Vingt-quatre', '2026-09-24'],
];
test.beforeEach(async ({ page, store }) => {
  const p = store.createProject('Alpha');
  for (const [title, doneAt] of DONE) store.updateTask(store.createTask(p.id, title).id, { doneAt });
  await page.goto('/log');
  await expect(page.locator('#journal .day').first()).toBeVisible();
});

// textContent : la majuscule initiale est ajoutée en CSS.
const days = (page: Page) => page.locator('#journal .day h3');
const date = (page: Page) => page.locator('#filter-date');
const RECENT = [
  'jeudi 24 septembre 2026', 'mercredi 23 septembre 2026', 'lundi 21 septembre 2026',
  'dimanche 20 septembre 2026', 'vendredi 18 septembre 2026',
];
const OLDER = ['mercredi 16 septembre 2026', 'mardi 15 septembre 2026', 'lundi 14 septembre 2026'];

test('Log : les 5 derniers jours ayant des entrées ; < et > de 5 en 5 ; Courant y revient', async ({ page }) => {
  const prev = page.getByRole('button', { name: 'Jours précédents' });
  const next = page.getByRole('button', { name: 'Jours suivants' });
  const current = page.getByRole('button', { name: 'Courant', exact: true });
  // Jours vides (22, 19, 17) sautés ; aujourd'hui (25), vide, absent.
  await expect(days(page)).toHaveText(RECENT);
  await expect(page.locator('#log-count')).toHaveText('6 tâches trouvées dans 5 journées');
  await expect(next).toBeDisabled();
  await expect(current).toBeDisabled();
  await expect(date(page)).toHaveValue(''); // vide = période courante

  await prev.click();
  await expect(days(page)).toHaveText(OLDER);
  await expect(prev).toBeDisabled(); // plus rien avant
  await expect(current).toBeEnabled();
  await next.click();
  await expect(days(page)).toHaveText(RECENT);
  await prev.click();
  await current.click();
  await expect(days(page)).toHaveText(RECENT);
  await expect(current).toBeDisabled();
  // Au clavier : ← / → (hors champ), sans effet en bout de liste.
  await page.locator('#journal').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(days(page)).toHaveText(OLDER);
  await page.keyboard.press('ArrowLeft');
  await expect(days(page)).toHaveText(OLDER);
  await page.keyboard.press('ArrowRight');
  await expect(days(page)).toHaveText(RECENT);
  // Dans la recherche, ← / → déplacent le curseur du texte.
  await page.locator('#log-search').fill('Vingt');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#log-search')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Jours précédents' })).toHaveAttribute('title', /\(←\)$/);
  await page.locator('#log-search').fill('');
  // « Courant » tout à droite de la ligne de navigation.
  const right = (b: { x: number; width: number }) => b.x + b.width;
  const log = (await page.locator('#journal').boundingBox())!;
  expect(Math.abs(right((await current.boundingBox())!) - right(log))).toBeLessThan(2);
});

test('date : les 5 jours ayant des entrées jusqu’à ce jour', async ({ page }) => {
  await date(page).fill('2026-09-19'); // jour vide : fenêtre jusqu'au 18
  await expect(days(page)).toHaveText(['vendredi 18 septembre 2026', ...OLDER]);
  // > : les jours suivants, jusqu'à la période courante.
  await page.getByRole('button', { name: 'Jours suivants' }).click();
  await expect(days(page)).toHaveText(RECENT);
});

test('d : focus sur la date ; saisie au clavier, année appliquée seulement complète', async ({ page }) => {
  await page.locator('#journal').click({ position: { x: 5, y: 5 } }); // hors champ
  await page.keyboard.press('d');
  await expect(date(page)).toBeFocused(); // premier segment (mois)
  await page.keyboard.type('092020'); // format mm/jj/aaaa du navigateur de test ; année 0020 ignorée
  await expect(days(page)).toHaveText(RECENT);
  await page.keyboard.type('26'); // 2026 : appliquée
  await expect(days(page)).toHaveText(['dimanche 20 septembre 2026', 'vendredi 18 septembre 2026', ...OLDER]);
  await expect(date(page)).toBeFocused();
});

test('onglet Log : filtres (recherche, date, projet) sur une ligne sous les onglets, alignés à droite', async ({ page }) => {
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const middle = async (sel: string) => {
    const b = await box(sel);
    return b.y + b.height / 2;
  };
  const tabs = await box('[role="tablist"]');
  const line = await middle('#log-search');
  expect(line).toBeGreaterThan(tabs.y + tabs.height);
  for (const sel of ['#filter-date', '#filter-project']) {
    expect(Math.abs((await middle(sel)) - line), sel).toBeLessThan(4);
  }
  const log = await box('#journal');
  const project = await box('#filter-project');
  expect(Math.abs(project.x + project.width - (log.x + log.width))).toBeLessThan(2);
  // Réinitialiser (visible quand un filtre est actif) reste aussi sur la ligne.
  await date(page).fill('2026-09-20');
  expect(Math.abs((await middle('#filter-reset')) - line)).toBeLessThan(4);
});

test('P, T, L : onglet Projets, Aujourd’hui, Log ; Alt+← / Alt+→ en boucle ; / et d vont au Log', async ({ page }) => {
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Log')).toHaveAttribute('title', 'Log (L)');
  await page.keyboard.press('P');
  await expect(tab('Projets')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#journal')).toHaveCount(0);
  await expect(page.locator('#projects .project')).toHaveCount(1);
  await page.keyboard.press('L');
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.locator('#projects')).toHaveCount(0);
  // Depuis Aujourd’hui : L va au Log ; T depuis le Log va à Aujourd’hui.
  await page.keyboard.press('T');
  await expect(tab('Aujourd’hui')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('L');
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  // Un 2e L reste sur le Log.
  await page.keyboard.press('L');
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  // Alt+← / Alt+→ : onglet voisin, en boucle.
  await page.keyboard.press('Alt+ArrowRight');
  await expect(tab('Projets')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(tab('Aujourd’hui')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(tab('Projets')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Projets')).toHaveAttribute('title', 'Projets (P)');
  // Clic sur l'onglet.
  await tab('Projets').click();
  await expect(tab('Projets')).toHaveAttribute('aria-selected', 'true');
  await tab('Log').click();
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  // / et d depuis Projets : passent dans l'onglet Log, sur le champ.
  await page.keyboard.press('P');
  await page.keyboard.press('/');
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#log-search')).toBeFocused();
  await page.keyboard.press('Alt+ArrowLeft'); // dans un champ : mot précédent, pas d'onglet
  await expect(tab('Log')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#log-search').press('Escape');
  await page.locator('#journal').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('P');
  await page.keyboard.press('d');
  await expect(date(page)).toBeFocused();
});

test('Réinitialiser : retour à la période courante', async ({ page }) => {
  await date(page).fill('2026-09-16');
  await expect(days(page)).toHaveText(OLDER);
  await page.getByRole('button', { name: 'Réinitialiser les filtres du Log' }).click();
  await expect(days(page)).toHaveText(RECENT);
  await expect(date(page)).toHaveValue('');
});

test('projet : seulement les jours où ce projet a des entrées, pagination comprise', async ({ page, store }) => {
  const beta = store.createProject('Beta');
  for (const d of ['2026-09-10', '2026-09-12', '2026-09-17', '2026-09-19', '2026-09-22', '2026-09-24'])
    store.updateTask(store.createTask(beta.id, `Beta ${d.slice(-2)}`).id, { doneAt: d });
  await page.reload();
  await page.locator('#filter-project').selectOption({ label: 'Beta' });
  await expect(page.locator('#journal .name')).toHaveText(['Beta 24', 'Beta 22', 'Beta 19', 'Beta 17', 'Beta 12']);
  // Nom du projet gardé au-dessus des tâches : on voit ce que montre le filtre.
  await expect(page.locator('#journal .project-label')).toHaveText(['Beta', 'Beta', 'Beta', 'Beta', 'Beta']);
  await page.getByRole('button', { name: 'Jours précédents' }).click();
  await expect(page.locator('#journal .name')).toHaveText(['Beta 10']);
  await expect(page.getByRole('button', { name: 'Jours précédents' })).toBeDisabled();
});

test('recherche : jours dont une tâche correspond (titre, contenu, ticket), compteur, mot souligné', async ({ page, store }) => {
  const p = store.createProject('Beta');
  store.updateTask(store.createTask(p.id, 'Déploiement').id, { doneAt: '2026-09-22', notes: 'Suite de la réunion **Vingt**' });
  store.updateTask(store.createTask(p.id, 'Ticket seul').id, { doneAt: '2026-09-19', jira: 'done', jiraKey: 'VING-1' });
  await page.reload();
  const count = page.locator('#log-count');

  await page.keyboard.press('/');
  await expect(page.locator('#log-search')).toBeFocused();
  await page.keyboard.type('VINGT'); // casse ignorée ; titre, contenu et ticket (VING-1 ne correspond pas)
  await expect(days(page)).toHaveText([
    'jeudi 24 septembre 2026',
    'mercredi 23 septembre 2026',
    'mardi 22 septembre 2026', // trouvé par le contenu
    'lundi 21 septembre 2026',
    'dimanche 20 septembre 2026',
  ]);
  await expect(count).toHaveText('6 tâches trouvées dans 5 journées');
  // Occurrences soulignées dans les titres des cartes (pas de fond coloré).
  const marks = page.locator('#journal mark.search-match');
  await expect(marks).toHaveText(['Vingt', 'Vingt', 'Vingt', 'Vingt', 'Vingt']);
  await expect(marks.first()).toHaveCSS('text-decoration-line', /underline/);
  await expect(marks.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(marks.first()).toHaveCSS('text-decoration-thickness', '3px');
  await expect(page.locator('#journal .name', { hasText: 'Déploiement' }).locator('mark')).toHaveCount(0);
  // Rien d'autre avant le 20 : pas de jours précédents.
  await expect(page.getByRole('button', { name: 'Jours précédents' })).toBeDisabled();

  await page.locator('#log-search').fill('ving-1');
  await expect(days(page)).toHaveText(['samedi 19 septembre 2026']);
  await expect(count).toHaveText('1 tâche trouvée dans 1 journée');

  // Accents ignorés : « deploi » trouve et souligne « Déploi ».
  await page.locator('#log-search').fill('deploi');
  await expect(page.locator('#journal .name')).toHaveText(['Déploiement']);
  await expect(page.locator('#journal mark')).toHaveText(['Déploi']);

  // Recherche + date : fenêtre jusqu'à ce jour.
  await page.locator('#log-search').fill('vingt');
  await date(page).fill('2026-09-21');
  await expect(days(page)).toHaveText(['lundi 21 septembre 2026', 'dimanche 20 septembre 2026']);
  await expect(count).toHaveText('3 tâches trouvées dans 2 journées');

  // Rien ne correspond : message exact.
  await page.locator('#log-search').fill('introuvable');
  await expect(page.locator('#journal-days .empty')).toHaveText('Aucune tâche trouvée.');
  await expect(count).toHaveText('Aucune tâche trouvée');

  // Échap vide la recherche.
  await page.locator('#log-search').press('Escape');
  await expect(page.locator('#log-search')).toHaveValue('');
  await expect(page.locator('#journal mark')).toHaveCount(0);
});
