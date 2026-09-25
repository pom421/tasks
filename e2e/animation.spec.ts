import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';

// Animations (AutoAnimate) : actives ici, coupées dans les autres tests
// (reducedMotion: 'reduce' dans playwright.config.ts).
test.use({ reducedMotion: 'no-preference' });

// Animations AutoAnimate en cours (Web Animations API) ; les transitions et
// animations CSS (survol, focus des boutons) ne comptent pas.
const running = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length);
const current = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.navKey ?? null);

test.beforeEach(async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  store.createTask(alpha.id, 'Une');
  store.createTask(alpha.id, 'Deux');
  const beta = store.createProject('Beta');
  store.createTask(beta.id, 'Trois');
  store.updateProject(beta.id, { favorite: true });
  store.updateTask(store.createTask(alpha.id, 'Faite le 24').id, { doneAt: '2026-09-24' });
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(2);
});

test('déplacer une tâche (Alt+↓) : animée', async ({ page }) => {
  await page.locator('.task .name', { hasText: 'Une' }).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => running(page)).toBeGreaterThan(0);
  await expect(page.locator('#projects .task .name')).toHaveText(['Deux', 'Une', 'Trois']);
});

test('déplacer un projet (Alt+↓) : animé', async ({ page }) => {
  await page.locator('.project-head .name', { hasText: 'Alpha' }).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => running(page)).toBeGreaterThan(0);
  await expect(page.locator('#projects .project-head .name')).toHaveText(['Beta', 'Alpha']);
});

test('filtrer (Favoris) : animé', async ({ page }) => {
  await page.locator('#favorites-only').click();
  await expect.poll(() => running(page)).toBeGreaterThan(0);
  await expect(page.locator('#projects .project-head .name')).toHaveText(['Beta']);
});

test('rechercher dans le Log : animé', async ({ page }) => {
  await page.locator('#log-search').fill('faite');
  await expect.poll(() => running(page)).toBeGreaterThan(0); // dès l'arrivée des résultats
  await expect(page.locator('#journal .day h3')).toHaveText(['jeudi 24 septembre 2026']);
});

test('clavier pendant une animation de sortie : l’élément qui disparaît est ignoré', async ({ page }) => {
  // Trois, seule tâche de Beta, cochée : elle quitte la liste (animation) ;
  // ↓ enchaînés aussitôt ne doivent pas passer par elle.
  await page.locator('.task .name', { hasText: 'Trois' }).focus();
  await page.keyboard.press(' ');
  await expect(page.locator('#journal .task .name')).toHaveText(['Trois']);
  expect(await current(page)).toMatch(/^project:/); // plus de tâche dans Beta : le projet
  await page.keyboard.press('ArrowDown'); // + Ajouter une tâche
  await page.keyboard.press('ArrowDown'); // + Nouveau projet
  await page.keyboard.press('ArrowDown'); // Trois, dans le Log
  expect(await current(page)).toMatch(/^task:/);
  await expect(page.locator(':focus')).toHaveText('Trois');
});

test('système « réduire les animations » : aucune animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('.task .name', { hasText: 'Une' }).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('#projects .task .name')).toHaveText(['Deux', 'Une', 'Trois']);
  expect(await running(page)).toBe(0);
});
