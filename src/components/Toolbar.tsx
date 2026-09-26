import { Archive, Flag, Heart, Settings as SettingsIcon } from 'lucide-react';
import type { JiraState, Priority } from '../../shared/types.ts';
import { PRIORITY_COLOR, PriorityIcon } from './Priority';
import { cn } from '@/lib/utils';
import { useActions } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { HelpDialog } from './HelpDialog';

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

      <HelpDialog open={helpOpen} onOpenChange={onHelpOpen} />
    </header>
  );
}
