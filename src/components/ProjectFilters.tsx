import { Archive, Flag, Heart } from 'lucide-react';
import { allTags, bugtrackerState, type BugtrackerState, type Priority, type Project } from '../../shared/types.ts';
import { PRIORITY_COLOR, PriorityIcon } from './Priority';
import { TagInput } from './TagInput';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ProjectFiltersProps {
  projects: Project[];
  bugtrackerFilter: BugtrackerState;
  onBugtrackerFilter: () => void;
  priorityFilter: Priority | null;
  onPriorityFilter: () => void;
  favoritesOnly: boolean;
  onFavoritesOnly: () => void;
  archivedOnly: boolean;
  onArchivedOnly: () => void;
  tagFilter: string[];
  onTagFilter: (tags: string[]) => void;
}

// Actif : texte à pleine intensité ; inactif : atténué. Hauteur des champs du Log.
const filterClass = (active: boolean) => cn('h-[26px]', active ? 'text-foreground' : 'text-muted-foreground');

// Filtres de l'onglet Projets, sous les onglets, alignés à droite,
// combinables (ET logique). Ligne réservée même vide : la liste ne bouge pas
// quand un filtre apparaît. Chacun n'est affiché que
// s'il peut servir (ou s'il est actif, pour pouvoir le couper) : compteurs sur
// tous les projets, indépendamment des autres filtres actifs.
// Boutons bascule sobres : toujours à contour ; icône vide, pleine quand le
// filtre est actif ; état annoncé par aria-pressed.
export function ProjectFilters({ projects, bugtrackerFilter, onBugtrackerFilter, priorityFilter, onPriorityFilter, favoritesOnly, onFavoritesOnly, archivedOnly, onArchivedOnly, tagFilter, onTagFilter }: ProjectFiltersProps) {
  const tasks = projects.flatMap((p) => p.tasks);
  const bugtrackerWanted = tasks.filter((t) => bugtrackerState(t) === 'wanted').length; // tâches à faire à reporter
  const bugtrackerDone = tasks.filter((t) => bugtrackerState(t) === 'done').length; // tâches à faire reportées
  const priorities = tasks.filter((t) => t.priority).length;
  const favorites = projects.filter((p) => p.favorite_at).length;
  const archived = projects.filter((p) => p.archived_at).length;
  const tags = allTags(tasks); // tags des tâches à faire
  const show = {
    bugtracker: bugtrackerWanted > 0 || bugtrackerDone > 0 || bugtrackerFilter !== 'none',
    priority: priorities > 0 || Boolean(priorityFilter),
    archived: archived > 0 || archivedOnly,
    favorites: favorites > 0 || favoritesOnly,
    tags: tags.length > 0 || tagFilter.length > 0,
  };
  return (
    <div role="group" aria-label="Filtres des projets" className="mt-3 flex min-h-[26px] flex-wrap items-center justify-end gap-1.5">
      {/* Tags (#) : autocomplétion parmi les tags des tâches à faire, ✕ pour en retirer un. */}
      {show.tags && (
        <TagInput
          id="project-tags"
          tags={tagFilter}
          suggestions={tags}
          onChange={onTagFilter}
          label="Filtrer par tags"
          title="Seulement les tâches portant tous ces tags (#)"
          placeholder="Tags…"
          removeLabel={(tag) => `Retirer #${tag} du filtre`}
          className="mr-auto"
        />
      )}
      {/* Report : un clic (ou R) passe à la suite : à reporter → reportées → tous. */}
      {show.bugtracker && (
        <Button
          id="bugtracker-pending"
          className={filterClass(bugtrackerFilter !== 'none')}
          aria-pressed={bugtrackerFilter !== 'none'}
          title="À reporter → reportées → toutes (R)"
          onClick={onBugtrackerFilter}
        >
          <Flag aria-hidden fill={bugtrackerFilter !== 'none' ? 'currentColor' : 'none'} />
          {bugtrackerFilter === 'done' || (bugtrackerFilter === 'none' && !bugtrackerWanted)
            ? `${bugtrackerDone} ${bugtrackerDone > 1 ? 'tâches reportées' : 'tâche reportée'}`
            : `${bugtrackerWanted} ${bugtrackerWanted > 1 ? 'tâches' : 'tâche'} à reporter`}
        </Button>
      )}
      {/* Priorité : un clic (ou P) passe à la suite : 1 → 2 → 3 → toutes. */}
      {show.priority && (
        <Button
          id="priority-filter"
          className={filterClass(Boolean(priorityFilter))}
          aria-pressed={Boolean(priorityFilter)}
          title="Priorité 1 → 2 → 3 → toutes (!)"
          onClick={onPriorityFilter}
        >
          <PriorityIcon priority={priorityFilter} noDigit className={cn(priorityFilter && PRIORITY_COLOR[priorityFilter])} />
          {priorityFilter ? `Priorité ${priorityFilter}` : 'Priorités'}
        </Button>
      )}
      {show.archived && (
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
      {show.favorites && (
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
