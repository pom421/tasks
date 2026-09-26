import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Archive, ArchiveRestore, Heart, Trash2 } from 'lucide-react';
import { jiraState, type JiraState, type Priority, type Project, type Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { moveDirection } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AddInput, EditableName } from './Editable';
import { TaskRow } from './TaskRow';

type MoveTask = (task: Task, direction: -1 | 1) => void;

interface ProjectCardProps {
  project: Project;
  onMove?: MoveTask;
  onMoveProject: (direction: -1 | 1) => void;
}

// Clavier, sur l'en-tête du projet (hors champ de saisie) : f favori,
// a archiver / désarchiver, x ou Suppr demande la suppression, un second
// appui la confirme ; Alt+↑ / Alt+↓ déplacent le projet. Tout est annulable (u).
function ProjectCard({ project: p, onMove, onMoveProject }: ProjectCardProps) {
  const { setLastProject, undoable } = useActions();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = Boolean(p.archived_at);
  const favorite = Boolean(p.favorite_at);
  const navKey = `project:${p.id}`;

  // Modification annulable (u) et rejouable (U) : before = valeurs d'avant.
  type Patch = Parameters<typeof api.updateProject>[1];
  const change = (label: string, patch: Patch, before: Patch) =>
    undoable({ label, focus: navKey, run: () => api.updateProject(p.id, patch), undo: () => api.updateProject(p.id, before) });
  const toggleFavorite = () => change(favorite ? 'retrait des favoris' : 'ajout aux favoris', { favorite: !favorite }, { favorite });
  const toggleArchived = () => change(archived ? 'désarchivage' : 'archivage', { archived: !archived }, { archived });
  const remove = () => {
    let deleted: Record<string, unknown> | undefined;
    return undoable({
      label: 'suppression du projet',
      focus: navKey,
      run: async () => (deleted = await api.deleteProject(p.id)),
      undo: () => api.restoreProject(deleted!),
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const direction = moveDirection(e);
    if (direction) {
      e.preventDefault();
      setConfirmDelete(false);
      onMoveProject(direction);
      return;
    }
    if ((e.target as HTMLElement).matches('input') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'x' || e.key === 'Delete') {
      e.preventDefault();
      if (confirmDelete) remove();
      else setConfirmDelete(true);
      return;
    }
    if (confirmDelete && e.key === 'Escape') e.stopPropagation();
    setConfirmDelete(false); // toute autre touche annule la demande
    if (e.key === 'f') {
      e.preventDefault();
      toggleFavorite();
    }
    if (e.key === 'a') {
      e.preventDefault();
      toggleArchived();
    }
  };

  // Le focus quitte l'en-tête : la demande de suppression est abandonnée.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setConfirmDelete(false);
  };

  // Création : annuler la supprime, rejouer la restaure (même identifiant,
  // les actions suivantes de l'historique la retrouvent).
  const addTask = async (title: string) => {
    let id = 0;
    let deleted: Record<string, unknown> | undefined;
    await undoable({
      label: 'ajout de la tâche',
      focus: () => `task:${id}`,
      run: async () => {
        id = ((await api.createTask(p.id, title)) as { id: number }).id;
      },
      undo: async () => (deleted = await api.deleteTask(id)),
      redo: () => api.restoreTask(deleted!),
    });
    return id > 0;
  };

  return (
    <div id={`project-${p.id}`} className={cn('project mt-5', archived && 'opacity-55')}>
      <div
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={cn(
          'project-head group flex items-baseline gap-2 border-b pb-0.5 has-[.name:focus]:bg-accent has-[.name:focus]:pl-1.5 has-[.name:focus]:shadow-[inset_3px_0_var(--color-primary)]',
          confirmDelete && 'bg-destructive/10 has-[.name:focus]:bg-destructive/10 has-[.name:focus]:shadow-[inset_3px_0_var(--color-destructive)]',
        )}
      >
        <EditableName
          value={p.name}
          navKey={navKey}
          className={cn('font-semibold', confirmDelete && 'shrink-0')}
          onSave={(name) => change('renommage du projet', { name }, { name: p.name })}
        />
        <span className="count text-xs text-muted-foreground">{p.tasks.length || ''}</span>
        {/* Bouton bascule : nom fixe (« Favori »), état annoncé par aria-pressed. */}
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('favorite self-center', favorite ? 'text-red-600' : 'text-muted-foreground')}
          aria-label="Favori"
          aria-pressed={favorite}
          title={favorite ? 'Retirer des favoris (f)' : 'Ajouter aux favoris (f)'}
          onClick={toggleFavorite}
        >
          <Heart aria-hidden fill={favorite ? 'currentColor' : 'none'} />
        </Button>
        {/* Suppression en deux temps, au clavier (x x) comme à la souris
            (corbeille, puis corbeille à nouveau) : pas de fenêtre de confirmation. */}
        {confirmDelete && (
          <span className="confirm-delete ml-auto min-w-0 self-center text-right text-xs text-destructive" role="alert">
            x ou corbeille à nouveau : supprimer le projet et ses tâches (Log compris) · Échap : annuler
          </span>
        )}
        <span
          className={cn(
            'actions flex gap-0.5 self-center',
            confirmDelete ? 'visible' : 'invisible ml-auto group-hover:visible group-focus-within:visible',
          )}
        >
          {!confirmDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="archive text-muted-foreground"
              aria-label={archived ? 'Désarchiver le projet' : 'Archiver le projet'}
              title={archived ? 'Désarchiver le projet (a)' : 'Archiver le projet (a)'}
              onClick={toggleArchived}
            >
              {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn('delete hover:text-destructive', confirmDelete ? 'text-destructive' : 'text-muted-foreground')}
            aria-label={confirmDelete ? 'Confirmer la suppression du projet' : 'Supprimer le projet'}
            title={confirmDelete ? 'Confirmer la suppression (x)' : 'Supprimer le projet (x x)'}
            onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
          >
            <Trash2 aria-hidden />
          </Button>
        </span>
      </div>
      <ul>
        {p.tasks.map((t) => (
          <TaskRow key={t.id} task={t} onMove={onMove && ((direction) => onMove(t, direction))} />
        ))}
      </ul>
      <AddInput
        placeholder="+ Ajouter une tâche (n)"
        navKey={`add:${p.id}`}
        onFocus={() => setLastProject(p.id)}
        onAdd={addTask}
      />
    </div>
  );
}

interface ProjectListProps {
  projects: Project[];
  archivedOnly: boolean;
  jiraFilter: JiraState; // filtre report : 'none' = aucun, sinon tâches à reporter / reportées
  priorityFilter: Priority | null; // filtre priorité : null = aucun
  favoritesOnly: boolean;
}

export function ProjectList({ projects, archivedOnly, jiraFilter, priorityFilter, favoritesOnly }: ProjectListProps) {
  const jiraOnly = jiraFilter !== 'none';
  // Filtres portant sur les tâches (report, priorité), combinés en ET.
  const taskFilter = jiraOnly || priorityFilter !== null;
  const keep = (t: Task) => (!jiraOnly || jiraState(t) === jiraFilter) && (!priorityFilter || t.priority === priorityFilter);
  const { undoable } = useActions();
  const visible = projects
    .filter((p) => Boolean(p.archived_at) === archivedOnly) // Archivés : seulement eux
    .filter((p) => !favoritesOnly || p.favorite_at)
    .map((p) => (taskFilter ? { ...p, tasks: p.tasks.filter(keep) } : p))
    .filter((p) => !taskFilter || p.tasks.length > 0);

  // Liste vide : message propre au filtre actif ; plusieurs filtres combinés :
  // message générique (tâches si un filtre de tâches en fait partie, sinon projets).
  const emptyMessage = () => {
    const active = [jiraOnly, priorityFilter, archivedOnly, favoritesOnly].filter(Boolean).length;
    if (active > 1) return taskFilter ? 'Aucune tâche avec les filtres demandés.' : 'Aucun projet avec les filtres demandés.';
    if (jiraOnly) return jiraFilter === 'wanted' ? 'Aucune tâche à faire à reporter.' : 'Aucune tâche à faire reportée.';
    if (priorityFilter) return `Aucune tâche à faire de priorité ${priorityFilter}.`;
    if (archivedOnly) return 'Aucun projet archivé.';
    if (favoritesOnly) return 'Aucun projet favori : cliquez sur le cœur d’un projet.';
    return 'Aucun projet. Créez-en un ci-dessous.';
  };

  // Monte / descend d'un cran. En bord de projet, la tâche passe dans le
  // projet visible voisin : à la fin du précédent, en tête du suivant.
  const moving = useRef(false);

  // Projet : passe au-dessus du projet visible précédent, ou sous le suivant.
  // L'index envoyé porte sur la liste complète (projets archivés compris).
  const moveProject = async (project: Project, direction: -1 | 1) => {
    if (moving.current) return;
    const neighbour = visible[visible.findIndex((p) => p.id === project.id) + direction];
    if (!neighbour) return;
    const others = projects.filter((p) => p.id !== project.id).map((p) => p.id);
    const index = others.indexOf(neighbour.id) + (direction > 0 ? 1 : 0);
    const before = projects.findIndex((p) => p.id === project.id); // index parmi les autres une fois retiré
    moving.current = true;
    await undoable({
      label: 'déplacement du projet',
      focus: `project:${project.id}`,
      run: () => api.moveProject(project.id, index),
      undo: () => api.moveProject(project.id, before),
    });
    moving.current = false;
  };

  const moveTask: MoveTask = async (task, direction) => {
    // Touche maintenue : on ignore les répétitions tant que le déplacement
    // précédent n'est pas enregistré et affiché (sinon calcul sur données périmées).
    if (moving.current) return;
    const pi = visible.findIndex((p) => p.id === task.project_id);
    const tasks = visible[pi].tasks;
    const ti = tasks.findIndex((t) => t.id === task.id);
    let target: { projectId: number; index: number } | undefined;
    if (ti + direction >= 0 && ti + direction < tasks.length) target = { projectId: task.project_id, index: ti + direction };
    else if (visible[pi + direction]) {
      const neighbour = visible[pi + direction];
      target = { projectId: neighbour.id, index: direction < 0 ? neighbour.tasks.length : 0 };
    }
    if (!target) return;
    moving.current = true;
    // Déplacement permis sans filtre de tâches : ti est la vraie position.
    await undoable({
      label: 'déplacement de la tâche',
      focus: `task:${task.id}`,
      run: () => api.moveTask(task.id, target.projectId, target.index),
      undo: () => api.moveTask(task.id, task.project_id, ti),
    });
    moving.current = false;
  };

  // Création : annuler le supprime, rejouer le restaure (même identifiant).
  const addProject = async (name: string) => {
    let id = 0;
    let deleted: Record<string, unknown> | undefined;
    await undoable({
      label: 'ajout du projet',
      focus: () => `project:${id}`,
      run: async () => {
        id = (await api.createProject(name)).id;
        // Projet neuf, sans tâche : on enchaîne sur la saisie de la première.
        return { focus: `add:${id}` };
      },
      undo: async () => (deleted = await api.deleteProject(id)),
      redo: () => api.restoreProject(deleted!),
    });
    return id > 0;
  };

  return (
    <>
      <section id="projects" aria-label="Projets">
        {visible.map((p) => (
          // Liste filtrée : les positions affichées ne sont pas les vraies, pas de déplacement.
          <ProjectCard
            key={p.id}
            project={p}
            onMove={taskFilter ? undefined : moveTask}
            onMoveProject={(direction) => moveProject(p, direction)}
          />
        ))}
        {!visible.length && (
          <p className="empty mt-3 italic text-muted-foreground">
            {emptyMessage()}
          </p>
        )}
      </section>
      <AddInput id="new-project" className="mt-6 font-semibold" placeholder="+ Nouveau projet (n n)" navKey="new-project" onAdd={addProject} />
    </>
  );
}
