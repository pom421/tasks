import http from 'node:http';
import type { Page } from '@playwright/test';
import type { Store } from '../server/db.ts';
import { test, expect } from './fixtures.ts';

type Issue = { summary: string; description: string | null; duedate: string | null };

// Faux Jira Data Center (PAT « secret » en Bearer), réglé dans la base du test.
async function fakeJira(store: Store, issues: Record<string, Issue>) {
  const server = http.createServer(async (req, res) => {
    const key = req.url!.match(/\/rest\/api\/2\/issue\/([^?]+)/)?.[1] ?? '';
    if (req.headers.authorization !== 'Bearer secret') return res.writeHead(401).end();
    if (!issues[key]) return res.writeHead(404).end();
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      issues[key] = JSON.parse(Buffer.concat(chunks).toString()).fields;
      return res.writeHead(204).end();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ key, fields: issues[key] }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  store.updateSettings({ bugtracker_base_url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, jira_pat: 'secret' });
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

test('boutons désactivés sans identifiant valide, sans URL ou sans PAT ; raison en info-bulle', async ({ page, store }) => {
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  const dialog = await openDialog(page);
  const push = dialog.getByRole('button', { name: 'Pousser vers Jira' });
  const pull = dialog.getByRole('button', { name: 'Récupérer depuis Jira' });
  await expect(push).toBeDisabled();
  await expect(pull).toBeDisabled();
  await expect(push).toHaveAttribute('title', 'Pousser vers Jira (>) : renseigner l’identifiant du ticket (PROJ-123)');
  // > sans effet.
  await page.keyboard.press('>');
  await expect(page.getByRole('dialog')).toHaveCount(1);

  // Identifiant mais ni URL ni PAT : désactivés, renvoi aux Réglages.
  const control = dialog.locator('.report-control');
  await control.click(); // à reporter
  await control.click(); // champ de l'identifiant
  await page.keyboard.type('proj-1');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.report-key')).toHaveText('PROJ-1');
  await expect(push).toBeDisabled();
  await expect(pull).toHaveAttribute('title', 'Récupérer depuis Jira (<) : renseigner l’URL des tickets et le PAT dans les Réglages');
  await page.keyboard.press('Escape');

  // URL et PAT réglés : actifs.
  store.updateSettings({ bugtracker_base_url: 'https://jira.example', jira_pat: 'secret' });
  store.updateTask(une.id, { bugtrackerKey: 'PROJ-1' });
  await openDialog(page);
  await expect(push).toBeEnabled();
  await expect(push).toHaveAttribute('title', 'Pousser vers Jira (>)');
  await expect(pull).toBeEnabled();
});

test('pousser : comparaison, confirmation par >, u remet l’ancien Jira', async ({ page, store }) => {
  const issues = { 'PROJ-1': { summary: 'Ancien titre', description: 'Texte Jira', duedate: null } };
  const jira = await fakeJira(store, issues);
  const alpha = store.createProject('Alpha');
  const une = store.createTask(alpha.id, 'Une');
  store.updateTask(une.id, { bugtrackerKey: 'PROJ-1', notes: 'Texte Jira', dueAt: '2026-10-12' });
  try {
    const dialog = await openDialog(page);
    await page.keyboard.press('>');
    const compare = page.getByRole('dialog', { name: 'Pousser vers Jira : PROJ-1' });
    await expect(compare).toBeVisible();
    await expect(compare.locator('.jira-local')).toHaveText(['Une', 'Lundi 12 octobre 2026', 'Texte Jira'].map((t) => new RegExp(t, 'i')));
    await expect(compare.locator('.jira-remote')).toHaveText(['Ancien titre', 'aucune', 'Texte Jira']);
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
    expect(issues['PROJ-1']).toEqual({ summary: 'Une', description: 'Texte Jira', duedate: '2026-10-12' });

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
  } finally {
    jira.close();
  }
});

test('récupérer : comparaison, Entrée confirme, la fiche et la ligne suivent, u annule', async ({ page, store }) => {
  const issues = { 'PROJ-1': { summary: 'Titre Jira', description: '# Jira\r\nContenu', duedate: '2026-10-12' } };
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
    await expect(updated.locator('.due-value')).toHaveText('lundi 12 octobre 2026');
    await expect(updated.locator('.notes-preview h1')).toHaveText('Jira');
    expect(issues['PROJ-1'].summary).toBe('Titre Jira'); // Jira inchangé

    await page.keyboard.press('Escape');
    const row = page.locator('#projects li.task', { hasText: 'Titre Jira' });
    await expect(row).toBeVisible();
    await page.keyboard.press('u');
    await expect(page.locator('#projects li.task', { hasText: 'Une' })).toBeVisible();
    await expect(row).toHaveCount(0);
  } finally {
    jira.close();
  }
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
