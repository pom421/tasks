import path from 'node:path';
import { defineConfig, type Plugin } from 'vite-plus';
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
  // PORT : autre port si 5173 est pris (ex. aperçu d'un worktree).
  server: { host: '127.0.0.1', port: Number(process.env.PORT) || 5173 },
  // Vite+ : `vp check` (format, lint avec types, TypeScript), `vp test` (tests unitaires).
  fmt: { singleQuote: true, printWidth: 140, ignorePatterns: ['pnpm-lock.yaml'] },
  lint: {
    // Modèle de capture d'écran (skill capture-ecran) : vérifié une fois copié dans e2e/.
    ignorePatterns: ['.claude/skills/capture-ecran/zz-shot.spec.ts'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  test: { include: ['server/test/*.test.ts', 'src/lib/*.test.ts'] },
});
