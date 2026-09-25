import { test as base, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/db.ts';
import { createApp } from '../server/app.ts';

// Front compilé par `vite build` (lancé par le script test:e2e).
const DIST = path.join(import.meta.dirname, '..', 'dist');

// Chaque test a son serveur et sa base vierge : `store` sert à préparer
// les données et à vérifier ce qui a été enregistré.
export const test = base.extend<{ store: Store }>({
  store: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-e2e-'));
    const store = new Store(path.join(dir, 'tasks.db'));
    await use(store);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  },
  baseURL: async ({ store }, use) => {
    const server = http.createServer(createApp(store, { staticDir: DIST }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    await use(`http://127.0.0.1:${port}`);
    server.close();
  },
});

export { expect };
