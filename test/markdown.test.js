import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/markdown.js';

test('zone à faire puis journées datées', () => {
  const items = parseMarkdown(`
* **Projet A**
    * tâche 1
- Projet B

2026-09-23
- Projet A
  - faite le 23
- 22/09/2026
  - faite le 22
`);
  assert.deepEqual(items, [
    { project: 'Projet A', title: 'tâche 1', doneAt: null },
    { project: 'Projet B', title: null, doneAt: null },
    { project: 'Projet A', title: 'faite le 23', doneAt: '2026-09-23' },
    { project: 'Sans projet', title: 'faite le 22', doneAt: '2026-09-22' },
  ]);
});
