// Découpe un texte autour des occurrences d'une recherche, casse et accents
// ignorés (comme la recherche du Log) : « Déploiement » contient « deploi ».
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface Part {
  text: string;
  match: boolean;
}

export function splitMatches(text: string, query: string): Part[] {
  const q = fold(query.trim());
  if (!q) return [{ text, match: false }];
  // Texte replié, et pour chacun de ses caractères, sa position dans l'original.
  let folded = '';
  const origin: number[] = [];
  let i = 0;
  for (const char of text) {
    for (const f of fold(char)) {
      folded += f;
      origin.push(i);
    }
    i += char.length;
  }
  origin.push(text.length);
  const parts: Part[] = [];
  let last = 0;
  for (let at = folded.indexOf(q); at !== -1; at = folded.indexOf(q, at + q.length)) {
    const start = origin[at];
    // Fin : début du caractère original qui suit la dernière lettre trouvée.
    const end = origin.slice(at + q.length).find((o) => o > origin[at + q.length - 1]) ?? text.length;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    last = end;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}
