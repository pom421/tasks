import { Archive, Flag, Heart } from 'lucide-react';
import { jiraState, type JiraState, type Priority, type Project } from '../../shared/types.ts';
import { PRIORITY_COLOR, PriorityIcon } from './Priority';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ProjectFiltersProps {
  projects: Project[];
  jiraFilter: JiraState;
  onJiraFilter: () => void;
  priorityFilter: Priority | null;
  onPriorityFilter: () => void;
  favoritesOnly: boolean;
  onFavoritesOnly: () => void;
  archivedOnly: boolean;
  onArchivedOnly: () => void;
}

// Actif : texte à pleine intensité ; inactif : atténué. Hauteur des champs du
// Log, pour que les deux colonnes restent alignées.
const filterClass = (active: boolean) => cn('h-[26px]', active ? 'text-foreground' : 'text-muted-foreground');

// Filtres de l'onglet Projets, sur la ligne des onglets (comme ceux du Log sur
// la ligne de son titre), combinables (ET logique). Chacun n'est affiché que
// s'il peut servir (ou s'il est actif, pour pouvoir le couper) : compteurs sur
// tous les projets, indépendamment des autres filtres actifs.
// Boutons bascule sobres : toujours à contour ; icône vide, pleine quand le
// filtre est actif ; état annoncé par aria-pressed.
export function ProjectFilters({ projects, jiraFilter, onJiraFilter, priorityFilter, onPriorityFilter, favoritesOnly, onFavoritesOnly, archivedOnly, onArchivedOnly }: ProjectFiltersProps) {
  const tasks = projects.flatMap((p) => p.tasks);
  const jiraWanted = tasks.filter((t) => jiraState(t) === 'wanted').length; // tâches à faire à reporter
  const jiraDone = tasks.filter((t) => jiraState(t) === 'done').length; // tâches à faire reportées
  const priorities = tasks.filter((t) => t.priority).length;
  const favorites = projects.filter((p) => p.favorite_at).length;
  const archived = projects.filter((p) => p.archived_at).length;
  return (
    <div role="group" aria-label="Filtres des projets" className="flex flex-wrap items-center gap-1.5">
      {/* Report : un clic (ou R) passe à la suite : à reporter → reportées → tous. */}
      {(jiraWanted > 0 || jiraDone > 0 || jiraFilter !== 'none') && (
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
      {(priorities > 0 || priorityFilter) && (
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
      {(archived > 0 || archivedOnly) && (
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
      {(favorites > 0 || favoritesOnly) && (
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
    </div>
  );
}
