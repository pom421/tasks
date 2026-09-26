import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// Une ligne : touches (alternatives séparées par « / », chacune une suite de
// touches) et action. Mêmes formulations que le README.
type Shortcut = [keys: string[][], label: string];

const SECTIONS: [title: string, shortcuts: Shortcut[]][] = [
  [
    'Navigation',
    [
      [[['↑', '↓'], ['k', 'j']], 'Élément précédent / suivant (projet, tâche, « + Ajouter »)'],
      [[['Début', 'Fin'], ['g g', 'G']], 'Premier / dernier élément'],
      [[['Maj+↑', 'Maj+↓']], 'Projet précédent / suivant'],
      [[['Entrée']], 'Modifier le nom ; sur « + Ajouter », écrire'],
      [[['Échap']], 'Quitter l’édition sans enregistrer'],
      [[['T']], 'Onglet Projets / Plan journée'],
    ],
  ],
  [
    'Fiche',
    [
      [[['Maj+Entrée'], ['o']], 'Ouvrir en lecture'],
      [[['e']], 'Ouvrir en édition (titre, Tab : ticket, contenu)'],
      [[['L']], 'Ouvrir sur le ticket'],
      [[['Ctrl+Entrée']], 'Enregistrer et lire ; en lecture, fermer'],
      [[['c', 'C', 't', '1', '2', '3']], 'Comme sur la tâche'],
    ],
  ],
  [
    'Tâche',
    [
      [[['n']], 'Nouvelle tâche (projet courant, sinon dernier utilisé)'],
      [[['Espace']], 'Cocher / décocher'],
      [[['Alt+↑', 'Alt+↓'], ['Alt+k', 'Alt+j']], 'Monter / descendre, jusque dans le projet voisin'],
      [[['1', '2', '3']], 'Priorité ; le même chiffre la retire'],
      [[['r']], 'Report : à reporter → reporté → rien'],
      [[['c']], 'Chrono : lancer / mettre en pause'],
      [[['C']], 'Chrono à zéro'],
      [[['t']], 'Plan journée : ajouter / retirer'],
      [[['x x']], 'Supprimer (ou Suppr ; Échap annule)'],
    ],
  ],
  [
    'Projet',
    [
      [[['n n']], 'Nouveau projet'],
      [[['Alt+↑', 'Alt+↓']], 'Monter / descendre le projet'],
      [[['f']], 'Favori / plus favori'],
      [[['a']], 'Archiver / désarchiver'],
      [[['x x']], 'Supprimer avec ses tâches (ou Suppr)'],
    ],
  ],
  [
    'Filtres des projets',
    [
      [[['R']], 'À reporter → reportées → toutes'],
      [[['P']], 'Priorité 1 → 2 → 3 → toutes'],
      [[['F']], 'Projets favoris seulement'],
      [[['A']], 'Projets archivés seulement'],
    ],
  ],
  [
    'Log',
    [
      [[['/']], 'Rechercher (Tab : journée, projet)'],
      [[['d']], 'Choisir une journée'],
      [[['Échap']], 'Vider la recherche, retirer les filtres du Log'],
    ],
  ],
  [
    'Général',
    [
      [[['Échap Échap']], 'Retirer tous les filtres (projets et Log)'],
      [[['u']], 'Annuler la dernière action'],
      [[['?']], 'Cette aide'],
    ],
  ],
];

// Alternatives séparées par « / », passant à la ligne d'un bloc ; une touche par <kbd>
// (« g g » : deux touches à la suite).
function Keys({ keys }: { keys: string[][] }) {
  return keys.map((alt, i) => (
    <span key={i} className="inline-flex flex-wrap items-baseline gap-1">
      {alt
        .flatMap((combo) => combo.split(' '))
        .map((k, j) => (
          <kbd key={j} className="bg-muted min-w-5 rounded border border-b-2 px-1 text-center font-mono text-xs">
            {k}
          </kbd>
        ))}
      {i < keys.length - 1 && <span className="text-muted-foreground">/</span>}
    </span>
  ));
}

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Hauteur limitée à l'écran : le titre reste, la liste défile. Pas de
          description (aria-describedby vide : pas d'avertissement Radix). */}
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-4xl xl:max-w-6xl">
        <DialogTitle className="border-b px-6 py-4">Raccourcis</DialogTitle>
        <div className="min-h-0 overflow-y-auto px-6 pt-4">
          {/* Colonnes dans un bloc à hauteur naturelle : elles s'équilibrent. */}
          <div className="gap-10 md:columns-2 xl:columns-3">
            {SECTIONS.map(([title, shortcuts]) => (
              <section key={title} className="mb-4 break-inside-avoid">
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
                <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 text-sm">
                  {shortcuts.map(([keys, label]) => (
                    <div key={label} className="contents">
                      <dt className="flex flex-wrap items-baseline gap-1">
                        <Keys keys={keys} />
                      </dt>
                      <dd>{label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
