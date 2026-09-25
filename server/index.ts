// Point d'entrée en production : sert l'API et le front compilé (dist/).
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './db.ts';
import { createApp } from './app.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 3000;
// Écoute sur la boucle locale uniquement : l'app n'a pas d'authentification.
const host = process.env.HOST || '127.0.0.1';
const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').map((h) => h.trim().toLowerCase());

const store = new Store(process.env.TASKS_DB || path.join(ROOT, 'data', 'tasks.db'));
const server = http.createServer(createApp(store, { allowedHosts, staticDir: path.join(ROOT, 'dist') }));
server.requestTimeout = 30_000;
server.listen(port, host, () => {
  console.log(`Tasks : http://localhost:${port}`);
});
