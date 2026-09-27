// schema.ts doit décrire exactement la base que produisent les migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { is, SQL } from 'drizzle-orm';
import { getTableConfig, SQLiteDialect } from 'drizzle-orm/sqlite-core';
import { Store } from '../db.ts';
import { tables } from '../schema.ts';

const dialect = new SQLiteDialect();

// Valeur par défaut telle que SQLite la rapporte (sans parenthèses extérieures).
function defaultOf(value: unknown): string | null {
  if (value === undefined) return null;
  if (is(value, SQL)) return dialect.sqlToQuery(value).sql.replace(/^\((.*)\)$/, '$1');
  return String(value);
}

test('schéma : schema.ts correspond à la base migrée', () => {
  const store = new Store(':memory:');
  const db = store.db;
  const actualTables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  ).map((r) => r.name);
  assert.deepEqual(actualTables, tables.map((t) => getTableConfig(t).name).sort());

  for (const table of tables) {
    const config = getTableConfig(table);
    const name = config.name;

    // Colonnes : type, NOT NULL (hors clé primaire), valeur par défaut, clé primaire.
    const columns = (
      db.prepare(`PRAGMA table_info(${name})`).all() as { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[]
    )
      .map((c) => ({ name: c.name, type: c.type.toLowerCase(), notNull: c.pk ? true : Boolean(c.notnull), default: c.dflt_value, pk: Boolean(c.pk) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const expected = config.columns
      .map((c) => ({ name: c.name, type: c.getSQLType(), notNull: c.notNull, default: defaultOf(c.default), pk: c.primary }))
      .sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(columns, expected, `colonnes de ${name}`);

    // Index (hors index automatiques des clés primaires).
    const indexes = (db.prepare(`PRAGMA index_list(${name})`).all() as { name: string; origin: string }[])
      .filter((i) => i.origin === 'c')
      .map((i) => ({
        name: i.name,
        columns: (db.prepare(`PRAGMA index_info(${i.name})`).all() as { name: string }[]).map((c) => c.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const expectedIndexes = config.indexes
      .map((i) => ({ name: i.config.name, columns: i.config.columns.map((c) => (c as { name: string }).name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(indexes, expectedIndexes, `index de ${name}`);

    // Clés étrangères.
    const fks = (
      db.prepare(`PRAGMA foreign_key_list(${name})`).all() as { table: string; from: string; to: string; on_delete: string }[]
    ).map((f) => ({ from: f.from, table: f.table, to: f.to, onDelete: f.on_delete.toLowerCase() }));
    const expectedFks = config.foreignKeys.map((fk) => {
      const ref = fk.reference();
      return {
        from: ref.columns[0].name,
        table: getTableConfig(ref.foreignTable).name,
        to: ref.foreignColumns[0].name,
        onDelete: fk.onDelete ?? 'no action',
      };
    });
    assert.deepEqual(fks, expectedFks, `clés étrangères de ${name}`);
  }
  store.close();
});
