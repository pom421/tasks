import type { Page } from '@playwright/test';
import type { Store } from '../server/db.ts';
import { fakeJira as fakeServer, type FakeIssue } from '../server/test/fake-jira.ts';
import { test, expect } from './fixtures.ts';

// Faux Jira Data Center (PAT « secret » en Bearer), réglé dans la base du test.
async function fakeJira(store: Store, issues: Record<string, FakeIssue>) {
  const { server, url } = await fakeServer(issues);
  store.updateSettings({ bugtracker_base_url: url, jira_pat: 'secret' });
  return server;
}

// Ouvre la fiche de la première tâche (o), focus dans la lecture.
async function openDialog(page: Page) {
  await page.goto('/');
  await expect(page.locator('.project')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  return page.getByRole('dialog', { name: 'Une' });
}

test('icônes Jira : seulement celles qui servent (identifiant, URL et PAT) ; jamais désactivées', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  const dialog = await openDialog(page);
  const jiraButtons = dialog.locator('button.jira-push, button.jira-pull, button.jira-create');
  // Rien : ni identifiant, ni URL, ni PAT, ni ticket de projet.
  await expect(jiraButtons).toHaveCount(0);
  // > sans effet.
  await page.keyboard.press('>');
  await expect(page.getByRole('dialog')).toHaveCount(1);

  // Identifiant mais ni URL ni PAT : toujours rien (pas d'icône inutilisable).
  const control = dialog.locator('.report-control');
  await control.click(); // à reporter
  await control.click(); // champ de l'identifiant
  await page.keyboard.type('proj-1');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.report-key')).toHaveText('PROJ-1');
  await expect(jiraButtons).toHaveCount(0);
  await page.keyboard.press('Escape');

  // URL et PAT réglés : pousser et récupérer, actifs.
  store.updateSettings({ bugtracker_base_url: 'https://jira.example', jira_pat: 'secret' });
  store.updateTask(une.id, { bugtrackerKey: 'PROJ-1' });
  await openDialog(page);
  const push = dialog.getByRole('button', { name: 'Pousser vers Jira' });
  const pull = dialog.getByRole('button', { name: 'Récupérer depuis Jira' });
  await expect(push).toBeEnabled();
  await expect(push).toHaveAttribute('title', 'Pousser vers Jira (>)');
  await expect(pull).toBeEnabled();
  await expect(dialog.locator('button.jira-create')).toHaveCount(0); // déjà un ticket : pas de création
});

test('créer le ticket : tâche enfant du ticket du projet, après confirmation ; identifiant enregistré', async ({ page, store }) => {
  const issues: Record<string, FakeIssue> = { 'PROJ-9': { summary: 'Epic du projet', description: null, duedate: null } };
  const jira = await fakeJira(store, issues);
  const alpha = store.createProject('Alpha');
  store.updateProject(alpha.id, { bugtrackerKey: 'PROJ-9' });
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { notes: 'Détail', dueAt: '2026-10-12', sprint: 'Sprint 43' });
  try {
    const dialog = await openDialog(page);
    const create = dialog.getByRole('button', { name: 'Créer le ticket dans Jira' });
    await expect(create).toBeEnabled();
    // Pas d'icônes de synchronisation sans ticket : l'icône « + » les remplace.
    await expect(dialog.locator('button.jira-push, button.jira-pull')).toHaveCount(0);
    await create.click();

    const confirm = page.getByRole('dialog', { name: 'Créer le ticket dans Jira' });
    await expect(confirm).toContainText('rattachée à PROJ-9');
    await expect(confirm.locator('.jira-new')).toHaveText(['Une', /Lundi 12 octobre 2026/i, 'Sprint 43', 'Détail']);

    // Échap : rien n'est créé.
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    expect(Object.keys(issues)).toEqual(['PROJ-9']);

    // + dans un champ de saisie : tapé, rien n'est créé.
    await page.keyboard.press('e');
    await expect(dialog.getByLabel('Titre')).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type('+');
    await expect(dialog.getByLabel('Titre')).toHaveValue('Une+');
    await expect(confirm).toHaveCount(0);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+Enter'); // retour en lecture

    // Confirmer par + puis + : le ticket est créé sous l'epic, l'identifiant est enregistré (report fait).
    await page.keyboard.press('+');
    await expect(confirm).toBeVisible();
    await page.keyboard.press('+');
    await expect(dialog.locator('.jira-status')).toHaveText('Ticket PROJ-101 créé dans Jira, rattaché à PROJ-9.');
    await expect(dialog.locator('.report-key')).toHaveText('PROJ-101');
    expect(issues['PROJ-101']).toEqual({ summary: 'Une', description: 'Détail', duedate: '2026-10-12', sprint: 'Sprint 43', epic: 'PROJ-9' });
    // Un ticket existe : « + » laisse la place à pousser / récupérer.
    await expect(create).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Pousser vers Jira' })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: 'Récupérer depuis Jira' })).toBeEnabled();
  } finally {
    jira.close();
  }
});

test('créer le ticket : absent sans ticket de projet, sans URL ni PAT, ou sur une tâche faite', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  await fakeJira(store, {}).then((server) => server.close()); // URL et PAT réglés, serveur éteint
  const dialog = await openDialog(page);
  await expect(dialog.locator('button.jira-create')).toHaveCount(0); // projet sans ticket
  await page.keyboard.press('Escape');

  store.updateProject(alpha.id, { bugtrackerKey: 'PROJ-9' });
  await openDialog(page);
  await expect(dialog.locator('button.jira-create')).toHaveCount(1);
  await page.keyboard.press('Escape');

  store.updateSettings({ bugtracker_base_url: null, jira_pat: null });
  await openDialog(page);
  await expect(dialog.locator('button.jira-create')).toHaveCount(0); // ni URL ni PAT
  await page.keyboard.press('Escape');

  store.updateSettings({ bugtracker_base_url: 'https://jira.example', jira_pat: 'secret' });
  store.updateTask(une.id, { doneAt: '2026-09-25' });
  await page.goto('/log');
  await page.locator('#journal li.task .name', { hasText: 'Une' }).first().focus();
  await page.keyboard.press('o');
  await expect(page.getByRole('dialog', { name: 'Une' }).locator('button.jira-create')).toHaveCount(0); // tâche faite
});

test('pousser : comparaison, confirmation par >, u remet l’ancien Jira', async ({ page, store }) => {
  const issues: Record<string, FakeIssue> = { 'PROJ-1': { summary: 'Ancien titre', description: 'Texte Jira', duedate: null, sprint: 'Sprint 42' } };
  const jira = await fakeJira(store, issues);
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { bugtrackerKey: 'PROJ-1', notes: 'Texte Jira', dueAt: '2026-10-12', sprint: 'Sprint 43' });
  try {
    const dialog = await openDialog(page);
    await page.keyboard.press('>');
    const compare = page.getByRole('dialog', { name: 'Pousser vers Jira : PROJ-1' });
    await expect(compare).toBeVisible();
    await expect(compare.locator('.jira-local')).toHaveText(['Une', /Lundi 12 octobre 2026/i, 'Sprint 43', 'Texte Jira']);
    await expect(compare.locator('.jira-remote')).toHaveText(['Ancien titre', 'aucune', 'Sprint 42', 'Texte Jira']);
    await expect(compare.getByText('(identique)')).toHaveCount(1); // le contenu
    // Les touches de la fiche ne passent pas : c ne lance pas le chrono.
    await page.keyboard.press('c');
    await expect(dialog.locator('.time-spent')).toHaveCount(0);

    // Échap : rien n'est envoyé, la fiche reste ouverte.
    await page.keyboard.press('Escape');
    await expect(compare).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect(issues['PROJ-1'].summary).toBe('Ancien titre');

    // > puis > : envoyé.
    await page.keyboard.press('>');
    await expect(compare).toBeVisible();
    await page.keyboard.press('>');
    await expect(dialog.getByRole('status')).toHaveText('Poussé vers Jira (PROJ-1).');
    expect(issues['PROJ-1']).toEqual({ summary: 'Une', description: 'Texte Jira', duedate: '2026-10-12', sprint: 'Sprint 43' });

    // Plus de différence : pas de comparaison.
    await page.keyboard.press('>');
    await expect(dialog.getByRole('status')).toHaveText('Déjà identique dans Jira.');
    await expect(compare).toHaveCount(0);

    // u (fiche fermée) : Jira reprend ses anciennes valeurs.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('u');
    await expect.poll(() => issues['PROJ-1'].summary).toBe('Ancien titre');
    expect(issues['PROJ-1'].duedate).toBeNull();
    expect(issues['PROJ-1'].sprint).toBe('Sprint 42');
  } finally {
    jira.close();
  }
});

test('récupérer : comparaison, Entrée confirme, la fiche et la ligne suivent, u annule', async ({ page, store }) => {
  const issues = { 'PROJ-1': { summary: 'Titre Jira', description: '# Jira\r\nContenu', duedate: '2026-10-12', sprint: 'Sprint 42' } };
  const jira = await fakeJira(store, issues);
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { bugtrackerKey: 'PROJ-1' });
  try {
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: 'Récupérer depuis Jira' }).click();
    const compare = page.getByRole('dialog', { name: 'Récupérer depuis Jira : PROJ-1' });
    await expect(compare.locator('.jira-remote').first()).toHaveText('Titre Jira');
    // Focus sur le bouton de confirmation : Entrée confirme.
    await expect(compare.getByRole('button', { name: 'Récupérer depuis Jira' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(compare).toHaveCount(0);
    const updated = page.getByRole('dialog', { name: 'Titre Jira' });
    await expect(updated.getByRole('status')).toHaveText('Récupéré depuis Jira (PROJ-1).');
    await expect(updated.getByLabel('Échéance')).toHaveValue('2026-10-12');
    await expect(updated.getByLabel('Sprint')).toHaveValue('Sprint 42');
    await expect(updated.locator('.notes-preview h1')).toHaveText('Jira');
    expect(issues['PROJ-1'].summary).toBe('Titre Jira'); // Jira inchangé

    await page.keyboard.press('Escape');
    const row = page.locator('#projects li.task', { hasText: 'Titre Jira' });
    await expect(row).toBeVisible();
    await page.keyboard.press('u');
    await expect(page.locator('#projects li.task', { hasText: 'Une' })).toBeVisible();
    await expect(row).toHaveCount(0);
    expect(store.db.prepare('SELECT sprint FROM task WHERE id = ?').get(une.id)).toEqual({ sprint: null });
  } finally {
    jira.close();
  }
});

test('sprint : sprints actifs puis à venir de Jira proposés (↓, Entrée, clic) ; Échap ferme la liste ; sans Jira, texte libre', async ({ page, store }) => {
  const jira = await fakeJira(store, { 'PROJ-1': { summary: 'Une', description: null, duedate: null } });
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { bugtrackerKey: 'PROJ-1' });
  try {
    const dialog = await openDialog(page);
    await page.keyboard.press('e');
    const sprint = dialog.getByRole('combobox', { name: 'Sprint' });
    await sprint.focus();
    const options = dialog.getByRole('listbox', { name: 'Sprints' }).getByRole('option');
    await expect(options).toHaveText(['Sprint 42', 'Sprint 43']); // actif d'abord, ni fermé ni doublon
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter'); // choisit, sans enregistrer
    await expect(sprint).toHaveValue('Sprint 43');
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    await expect(sprint).not.toHaveAttribute('readonly');

    // Filtre par le texte ; Échap ferme la liste, la fiche reste ouverte.
    await sprint.fill('');
    await page.keyboard.type('42');
    await expect(options).toHaveText(['Sprint 42']);
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    // Clic sur une proposition, puis Entrée : enregistré, retour en lecture.
    await page.keyboard.press('ArrowDown');
    await options.first().click();
    await expect(sprint).toHaveValue('Sprint 42');
    await page.keyboard.press('Enter');
    await expect(sprint).toHaveAttribute('readonly', '');
    await expect.poll(() => store.db.prepare('SELECT sprint FROM task WHERE id = ?').get(une.id)).toEqual({ sprint: 'Sprint 42' });
    // Lecture : pas de liste.
    await sprint.click();
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
  } finally {
    jira.close();
  }

  // Sans URL ni PAT : texte libre, aucune proposition.
  store.updateSettings({ bugtracker_base_url: null, jira_pat: null });
  const dialog = await openDialog(page);
  await page.keyboard.press('e');
  await dialog.getByRole('combobox', { name: 'Sprint' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
});

test('erreur de Jira affichée dans la fiche, sans comparaison', async ({ page, store }) => {
  const jira = await fakeJira(store, {});
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { bugtrackerKey: 'PROJ-404' });
  try {
    const dialog = await openDialog(page);
    await page.keyboard.press('<');
    await expect(dialog.getByRole('alert')).toHaveText('Ticket PROJ-404 introuvable dans Jira');
    await expect(page.getByRole('dialog')).toHaveCount(1);
  } finally {
    jira.close();
  }
});

test('réglages : PAT masqué, jamais réaffiché, retirable', async ({ page, store }) => {
  await page.goto('/admin');
  const pat = page.getByLabel('PAT Jira (jeton d’accès personnel)');
  await expect(pat).toHaveAttribute('type', 'password');
  await expect(pat).toHaveAttribute('placeholder', 'Aucun');
  await pat.fill('secret');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByRole('status').first()).toHaveText('Réglages enregistrés.');
  await expect(pat).toHaveValue('');
  await expect(pat).toHaveAttribute('placeholder', 'Enregistré (laisser vide pour le garder)');
  expect(store.jiraPat()).toBe('secret');

  // Rechargé : toujours vide ; enregistrer sans rien taper garde le PAT.
  await page.reload();
  await expect(pat).toHaveValue('');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByRole('status').first()).toHaveText('Réglages enregistrés.');
  expect(store.jiraPat()).toBe('secret');

  await page.getByRole('button', { name: 'Retirer' }).click();
  await expect(page.getByRole('status').first()).toHaveText('PAT retiré.');
  await expect(pat).toHaveAttribute('placeholder', 'Aucun');
  expect(store.jiraPat()).toBeNull();
});
