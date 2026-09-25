import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { Store } from './server/db.ts';
import { createApp } from './server/app.ts';

// En dev, l'API tourne dans le serveur Vite : une seule commande, `pnpm dev`.
function api(): Plugin {
  return {
    name: 'tasks-api',
    configureServer(server) {
      const store = new Store(process.env.TASKS_DB || path.resolve('data', 'tasks.db'));
      const app = createApp(store);
      server.middlewares.use((req, res, next) => (req.url?.startsWith('/api/') ? app(req, res) : next()));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), api()],
  resolve: { alias: { '@': path.resolve('src') } },
  server: { host: '127.0.0.1', port: 5173 },
});
