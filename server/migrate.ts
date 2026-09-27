// pnpm db:migrate [fichier] : état du schéma et migration d'une base.
//   pnpm db:migrate                 -> data/tasks.db (ou TASKS_DB)
//   pnpm db:migrate ~/ancienne.db   -> une autre base
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './db.ts';
import { LATEST_VERSION, describeMigration } from './migrations.ts';
import { schemaMigration } from './schema.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || process.env.TASKS_DB || path.join(ROOT, 'data', 'tasks.db');

try {
  const store = new Store(file);
  console.log(describeMigration(file, store.migration) ?? `${file} : à jour (version ${LATEST_VERSION}).`);
  console.table(store.orm.select().from(schemaMigration).orderBy(schemaMigration.version).all());
  store.close();
} catch (err) {
  console.error(`${file} : ${(err as Error).message}`);
  process.exit(1);
}
