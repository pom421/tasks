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
