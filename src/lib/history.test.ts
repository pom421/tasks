import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useHistory, type Entry } from './history.ts';

const entry = (label: string): Entry => ({ label, focus: '', undo: async () => {}, redo: async () => {} });
const labels = (list: Entry[]) => list.map((e) => e.label);

test('historique : annuler / rejouer déplacent les entrées ; une nouvelle action efface la suite', () => {
  const h = useHistory.getState;
  h().clear();
  h().record(entry('a'));
  h().record(entry('b'));
  h().undone();
  assert.deepEqual(labels(h().past), ['a']);
  assert.deepEqual(labels(h().future), ['b']);
  h().redone();
  assert.deepEqual(labels(h().past), ['a', 'b']);
  h().undone();
  h().record(entry('c'));
  assert.deepEqual(labels(h().past), ['a', 'c']);
  assert.deepEqual(h().future, []);
});
