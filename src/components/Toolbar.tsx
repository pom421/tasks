import { Archive, Flag, Heart, Settings as SettingsIcon } from 'lucide-react';
import type { JiraState, Priority } from '../../shared/types.ts';
import { PRIORITY_COLOR, PriorityIcon } from './Priority';
import { cn } from '@/lib/utils';
import { useActions } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const SHORTCUTS: [string, string][] = [
  ['↑ ↓  j k', 'Se déplacer (Début / Fin ou g g / G : premier / dernier)'],
  ['Maj+↑ Maj+↓', 'Projet précédent / suivant'],
  ['Maj+Entrée  o', 'Ouvrir la fiche ; e : tout modifier (Tab : champ suivant), Ctrl+Entrée : lecture'],
  ['e', 'Ouvrir la fiche directement en édition'],
  ['Entrée', 'Modifier le nom sélectionné / valider'],
  ['Échap', "Quitter l'édition ou un champ « + Ajouter », retour à la navigation"],
  ['Espace', 'Cocher / décocher la tâche'],
  ['Alt+↑ Alt+↓', 'Monter / descendre la tâche, jusque dans le projet voisin (Alt+k / Alt+j)'],
  ['r', 'Report : à reporter → reporté (fiche sur le ticket) → rien'],
  ['R', 'Afficher seulement les tâches à reporter → reportées → toutes (projets)'],
  ['P', 'Afficher seulement les tâches de priorité 1 → 2 → 3 → toutes (projets)'],
  ['L', 'Ouvrir la fiche sur l’identifiant du ticket (majuscule)'],
  ['c', 'Chrono de la tâche : lancer / mettre en pause (aussi dans la fiche)'],
  ['C', 'Remettre le chrono à zéro'],
  ['t', 'Ajouter la tâche au plan journée / l’en retirer (aussi dans la fiche)'],
  ['T', 'Onglet Projets / Plan journée'],
  ['1 2 3', 'Priorité 1, 2 ou 3 ; le même chiffre la retire (aussi dans la fiche)'],
  ['x x', 'Supprimer la tâche ou le projet (x une 2e fois pour confirmer)'],
  ['f', 'Sur un projet : favori / plus favori'],
  ['F', 'Afficher seulement les projets favoris'],
  ['a', 'Sur un projet : archiver / désarchiver'],
  ['A', 'Afficher seulement les projets archivés'],
  ['u', 'Annuler la dernière action (cocher, renommer, supprimer, chrono, plan journée, priorité, favori, archivage)'],
  ['n n', 'Nouveau projet (n deux fois, rapprochés)'],
  ['n', 'Nouvelle tâche (projet courant, sinon dernier utilisé)'],
  ['d', 'Filtrer le log sur une journée'],
  ['/', 'Rechercher dans le log (titre, contenu, ticket) ; Tab : journée, projet'],
  ['?', 'Cette aide'],
];

interface ToolbarProps {
  jiraWanted: number; // tâches à faire à reporter
  jiraDone: number; // tâches à faire reportées
  jiraFilter: JiraState;
  onJiraFilter: () => void;
  priorities: number; // tâches à faire avec une priorité
  priorityFilter: Priority | null;
  onPriorityFilter: () => void;
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

export function Toolbar({ jiraWanted, jiraDone, jiraFilter, onJiraFilter, priorities, priorityFilter, onPriorityFilter, favorites, favoritesOnly, onFavoritesOnly, archived, archivedOnly, onArchivedOnly, showFilters, helpOpen, onHelpOpen }: ToolbarProps) {
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
        {/* Report : un clic (ou R) passe à la suite : à reporter → reportées → tous. */}
        {showFilters && (jiraWanted > 0 || jiraDone > 0 || jiraFilter !== 'none') && (
          <Button
            id="jira-pending"
            className={filterClass(jiraFilter !== 'none')}
            aria-pressed={jiraFilter !== 'none'}
            title="À reporter → reportées → toutes (R)"
            onClick={onJiraFilter}
          >
            <Flag aria-hidden fill={jiraFilter !== 'none' ? 'currentColor' : 'none'} />
            {jiraFilter === 'done' || (jiraFilter === 'none' && !jiraWanted)
              ? `${jiraDone} ${jiraDone > 1 ? 'tâches reportées' : 'tâche reportée'}`
              : `${jiraWanted} ${jiraWanted > 1 ? 'tâches' : 'tâche'} à reporter`}
          </Button>
        )}
        {/* Priorité : un clic (ou P) passe à la suite : 1 → 2 → 3 → toutes. */}
        {showFilters && (priorities > 0 || priorityFilter) && (
          <Button
            id="priority-filter"
            className={filterClass(Boolean(priorityFilter))}
            aria-pressed={Boolean(priorityFilter)}
            title="Priorité 1 → 2 → 3 → toutes (P)"
            onClick={onPriorityFilter}
          >
            <PriorityIcon priority={priorityFilter} noDigit className={cn(priorityFilter && PRIORITY_COLOR[priorityFilter])} />
            {priorityFilter ? `Priorité ${priorityFilter}` : 'Priorités'}
          </Button>
        )}
        {showFilters && (archived > 0 || archivedOnly) && (
          <Button
            id="archived-only"
            className={filterClass(archivedOnly)}
            aria-pressed={archivedOnly}
            title="Afficher seulement les projets archivés (A)"
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
            title="Afficher seulement les projets favoris (F)"
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
