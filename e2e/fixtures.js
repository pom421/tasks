import { test as base, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/db.js';
import { createApp } from '../src/server.js';

// Chaque test a son serveur et sa base vierge : `store` sert à préparer
// les données et à vérifier ce qui a été enregistré.
export const test = base.extend({
  store: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-e2e-'));
    const store = new Store(path.join(dir, 'tasks.db'));
    await use(store);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  },
  baseURL: async ({ store }, use) => {
    const server = http.createServer(createApp(store));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    await use(`http://127.0.0.1:${server.address().port}`);
    server.close();
  },
});

export { expect };
