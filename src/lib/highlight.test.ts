import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMatches } from './highlight.ts';

const marked = (text: string, q: string) => splitMatches(text, q).map((p) => (p.match ? `[${p.text}]` : p.text)).join('');

test('recherche soulignée : toutes les occurrences, casse et accents ignorés', () => {
  assert.equal(marked('Déploiement du déploiement', 'DEPLOI'), '[Déploi]ement du [déploi]ement');
  assert.equal(marked('Revue', 'vue'), 'Re[vue]');
  assert.equal(marked('Revue', 'autre'), 'Revue');
  assert.equal(marked('Revue', '  '), 'Revue');
  assert.equal(marked('Café crème', 'e c'), 'Caf[é c]rème');
});
