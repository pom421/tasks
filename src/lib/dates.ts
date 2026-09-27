export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// « mercredi 23 septembre 2026 » (majuscule initiale ajoutée en CSS).
export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Saisie clavier d'une date : le navigateur émet « change » dès que la valeur
// est valide, y compris pendant la frappe de l'année (0002, 0020, 0202…).
// On attend une année à 4 chiffres avant d'agir.
export const isComplete = (value: string) => value === '' || Number(value.slice(0, 4)) >= 1000;

// Jour décalé de n jours ('YYYY-MM-DD').
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Format court et relatif : « auj. », « demain », « hier », « lun. 29 » dans la
// semaine autour d'aujourd'hui, sinon « 12 oct. » (« 12 oct. 2027 » une autre année).
export function shortDay(iso: string, today = localToday()): string {
  if (iso === today) return 'auj.';
  if (iso === addDays(today, 1)) return 'demain';
  if (iso === addDays(today, -1)) return 'hier';
  const d = new Date(`${iso}T00:00:00`);
  if (iso > addDays(today, -7) && iso < addDays(today, 7)) {
    return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${d.getDate()}`;
  }
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}
