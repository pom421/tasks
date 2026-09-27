// Base de démonstration (data/demo.db, recréée à chaque fois) : 3 projets,
// des tâches à faire et 8 jours ouvrés de Log jusqu'à hier, pour voir le rendu.
// Lancée par `pnpm demo` ; ne touche pas à data/tasks.db.
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../server/db.ts';

const file = path.resolve('data', 'demo.db');
fs.mkdirSync(path.dirname(file), { recursive: true });
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
const store = new Store(file);

// 8 jours ouvrés (hors week-end) avant aujourd'hui, du plus ancien au plus récent.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const workdays: string[] = [];
for (const d = new Date(); workdays.length < 8; ) {
  d.setDate(d.getDate() - 1);
  if (d.getDay() % 6) workdays.unshift(iso(d));
}

const api = store.createProject('API facturation');
const site = store.createProject('Site public');
const ops = store.createProject('Exploitation');
store.updateProject(api.id, { favorite: true });

// [projet, titre, jour (indice dans workdays), notes, ticket]
const done: [number, string, number, string?, string?][] = [
  [api.id, 'Lire la spécification des avoirs', 0],
  [ops.id, 'Préparer le déploiement de la v2.3', 0, 'Checklist dans le wiki, **déploiement** prévu jeudi'],
  [api.id, 'Endpoint GET /factures paginé', 1, undefined, 'FAC-101'],
  [site.id, 'Corriger le menu sur mobile', 1],
  [site.id, 'Relecture des textes de la page tarifs', 2],
  [api.id, 'Tests du calcul de TVA', 3],
  [ops.id, 'Déploiement de la v2.3 en recette', 3, undefined, 'OPS-42'],
  [api.id, 'Revue de code : export CSV', 4],
  [site.id, 'Optimiser les images de la page d’accueil', 4],
  [ops.id, 'Alerte disque plein sur le serveur de recette', 5],
  [api.id, 'Endpoint POST /avoirs', 5, undefined, 'FAC-108'],
  [site.id, 'Formulaire de contact : validation', 6],
  [ops.id, 'Déploiement de la v2.3 en production', 6, 'Aucun incident, **rollback** non nécessaire'],
  [api.id, 'Documentation OpenAPI des avoirs', 7],
  [site.id, 'Point d’équipe : retour sur le déploiement', 7],
];
for (const [projectId, title, day, notes, bugtrackerKey] of done) {
  const t = store.createTask(projectId, title);
  store.updateTask(t.id, { doneAt: workdays[day], notes, ...(bugtrackerKey && { bugtracker: 'done' as const, bugtrackerKey }) });
}

// Tags sur quelques tâches faites (filtre du Log).
store.updateTask(1, { tags: ['specs'] });
store.updateTask(3, { tags: ['api', 'client'] });

const today = iso(new Date());
const inDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
// timeSpent : temps passé (secondes), visible dans la fiche (sablier).
type Todo = { priority?: 1 | 2 | 3; dayAt?: string; dueAt?: string; tags?: string[]; timeSpent?: number; bugtracker?: 'wanted' };
const todo: [number, string, Todo?][] = [
  [api.id, 'Gérer les avoirs partiels', { priority: 1, dayAt: today, dueAt: inDays(3), tags: ['client'], timeSpent: 5400 }],
  [api.id, 'Limiter le débit de l’API', { priority: 2, dayAt: inDays(2), dueAt: inDays(6), tags: ['api', 'perf'], timeSpent: 1500 }],
  [api.id, 'Relancer le client sur le format des avoirs', { dayAt: workdays.at(-1), tags: ['client'] }],
  [site.id, 'Page « Mentions légales »', { bugtracker: 'wanted', dueAt: inDays(10) }],
  [site.id, 'Mode sombre', { priority: 3, tags: ['ui'] }],
  [ops.id, 'Préparer le déploiement de la v2.4', { dayAt: today }],
  [ops.id, 'Renouveler le certificat TLS', { dueAt: workdays.at(-2), timeSpent: 900 }],
  [ops.id, 'Mettre à jour la politique de sauvegarde', { dueAt: workdays.at(-4), tags: ['sécurité'] }],
  [site.id, 'Bannière cookies', { dayAt: inDays(1), tags: ['ui', 'client'] }],
];
for (const [projectId, title, patch] of todo) store.updateTask(store.createTask(projectId, title).id, patch ?? {});

store.close();
console.log(`Démo : ${file} (${done.length} tâches faites du ${workdays[0]} au ${workdays.at(-1)})`);
