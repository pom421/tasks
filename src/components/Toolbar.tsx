import { Archive, Flag, Heart, Settings as SettingsIcon } from 'lucide-react';
import { useActions } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const SHORTCUTS: [string, string][] = [
  ['↑ ↓  j k', 'Se déplacer (Début / Fin ou g g / G : premier / dernier)'],
  ['Maj+Entrée  o', 'Ouvrir la fiche ; e : tout modifier (Tab : champ suivant), Ctrl+Entrée : lecture'],
  ['e', 'Ouvrir la fiche directement en édition'],
  ['Entrée', 'Modifier le nom sélectionné / valider'],
  ['Échap', "Quitter l'édition ou un champ « + Ajouter », retour à la navigation"],
  ['Espace', 'Cocher / décocher la tâche'],
  ['Alt+↑ Alt+↓', 'Monter / descendre la tâche, jusque dans le projet voisin (Alt+k / Alt+j)'],
  ['J', 'Report : à reporter → reporté → rien (majuscule)'],
  ['L', 'Ouvrir la fiche sur l’identifiant du ticket (majuscule)'],
  ['t', 'Chrono de la tâche : lancer / mettre en pause (aussi dans la fiche)'],
  ['T', 'Remettre le chrono à zéro'],
  ['s', 'Ajouter la tâche au plan journée / l’en retirer (aussi dans la fiche)'],
  ['v', 'Onglet Projets / Plan journée'],
  ['p', 'Sur une tâche : priorité suivante, aucune → 1 → 2 → 3 → aucune (aussi dans la fiche)'],
  ['r', 'Afficher seulement les tâches à reporter (projets)'],
  ['*', 'Afficher seulement les projets favoris'],
  ['x x', 'Supprimer la tâche ou le projet (x une 2e fois pour confirmer)'],
  ['f', 'Sur un projet : favori / plus favori'],
  ['a', 'Sur un projet : archiver / désarchiver'],
  ['u', 'Annuler la dernière action (cocher, renommer, supprimer, chrono, plan journée, priorité, favori, archivage)'],
  ['p', 'Ailleurs que sur une tâche : nouveau projet'],
  ['n', 'Nouvelle tâche (projet courant, sinon dernier utilisé)'],
  ['d', 'Filtrer le log sur une journée'],
  ['f', 'Ailleurs que sur un projet : filtrer le log par projet'],
  ['/', 'Rechercher dans le log (titre, contenu, ticket)'],
  ['?', 'Cette aide'],
];

interface ToolbarProps {
  jiraPending: number;
  jiraFilter: boolean;
  onJiraFilter: () => void;
  favorites: number;
  favoritesOnly: boolean;
  onFavoritesOnly: () => void;
  archived: number; // nombre de projets archivés
  archivedOnly: boolean;
  onArchivedOnly: () => void;
  showFilters: boolean; // filtres de la zone des projets, masqués dans l'onglet Plan journée
  helpOpen: boolean;
  onHelpOpen: (open: boolean) => void;
}

// Actif : texte à pleine intensité ; inactif : atténué.
const filterClass = (active: boolean) => (active ? 'text-foreground' : 'text-muted-foreground');

export function Toolbar({ jiraPending, jiraFilter, onJiraFilter, favorites, favoritesOnly, onFavoritesOnly, archived, archivedOnly, onArchivedOnly, showFilters, helpOpen, onHelpOpen }: ToolbarProps) {
  const { navigate } = useActions();

  // Filtres de la zone des projets, combinables (ET logique). Chacun n'est
  // affiché que s'il peut servir (ou s'il est actif, pour pouvoir le couper),
  // indépendamment des autres filtres actifs.
  // Boutons bascule sobres : toujours à contour ; icône vide, pleine quand le
  // filtre est actif ; état annoncé par aria-pressed.
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 pt-6 pb-2">
      <h1 className="text-2xl font-bold">Tâches</h1>
      <nav className="flex flex-wrap items-center gap-1.5">
        {showFilters && (jiraPending > 0 || jiraFilter) && (
          <Button
            id="jira-pending"
            className={filterClass(jiraFilter)}
            aria-pressed={jiraFilter}
            title="Afficher seulement les tâches à reporter (r)"
            onClick={onJiraFilter}
          >
            <Flag aria-hidden fill={jiraFilter ? 'currentColor' : 'none'} />
            {jiraPending} {jiraPending > 1 ? 'tâches' : 'tâche'} à reporter
          </Button>
        )}
        {showFilters && (archived > 0 || archivedOnly) && (
          <Button
            id="archived-only"
            className={filterClass(archivedOnly)}
            aria-pressed={archivedOnly}
            title="Afficher seulement les projets archivés"
            onClick={onArchivedOnly}
          >
            <Archive aria-hidden fill={archivedOnly ? 'currentColor' : 'none'} /> Archivés
          </Button>
        )}
        {showFilters && (favorites > 0 || favoritesOnly) && (
          <Button
            id="favorites-only"
            className={filterClass(favoritesOnly)}
            aria-pressed={favoritesOnly}
            title="Afficher seulement les projets favoris (*)"
            onClick={onFavoritesOnly}
          >
            <Heart aria-hidden className="text-red-600" fill={favoritesOnly ? 'currentColor' : 'none'} /> Favoris
          </Button>
        )}
        <Button title="Raccourcis (?)" onClick={() => onHelpOpen(true)}>
          ?
        </Button>
        <Button asChild>
          <a
            href="/admin"
            id="settings-link"
            title="Réglages, export et import"
            aria-label="Réglages"
            onClick={(e) => {
              e.preventDefault();
              navigate('/admin');
            }}
          >
            <SettingsIcon aria-hidden />
          </a>
        </Button>
      </nav>

      <Dialog open={helpOpen} onOpenChange={onHelpOpen}>
        <DialogContent>
          <DialogTitle>Raccourcis</DialogTitle>
          <DialogDescription>À la souris : clic sur un nom pour le modifier.</DialogDescription>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {SHORTCUTS.map(([key, label]) => (
              <div key={label} className="contents">
                <dt>
                  <kbd className="rounded border px-1 font-mono text-xs">{key}</kbd>
                </dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </header>
  );
}
