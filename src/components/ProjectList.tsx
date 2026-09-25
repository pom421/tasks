import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Archive, ArchiveRestore, Heart, Trash2 } from 'lucide-react';
import { jiraState, type Project, type Task } from '../../shared/types.ts';
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
  const { act, setLastProject, setUndo } = useActions();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = Boolean(p.archived_at);
  const favorite = Boolean(p.favorite_at);
  const navKey = `project:${p.id}`;

  // L'annulation n'est mémorisée qu'une fois l'action réussie.
  const undoable = (label: string, run: () => Promise<unknown>, undo: () => Promise<unknown>) =>
    act(async () => {
      await run();
      setUndo({ label, run: undo, focus: navKey });
    });
  const toggleFavorite = () =>
    undoable(
      favorite ? 'retrait des favoris' : 'ajout aux favoris',
      () => api.updateProject(p.id, { favorite: !favorite }),
      () => api.updateProject(p.id, { favorite }),
    );
  const toggleArchived = () =>
    undoable(
      archived ? 'désarchivage' : 'archivage',
      () => api.updateProject(p.id, { archived: !archived }),
      () => api.updateProject(p.id, { archived }),
    );
  const remove = () => {
    let deleted: Record<string, unknown> | undefined;
    return undoable(
      'suppression du projet',
      async () => (deleted = await api.deleteProject(p.id)),
      () => api.restoreProject(deleted!),
    );
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
    // preventDefault : f n'ouvre pas en plus le filtre du Log (raccourci global).
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

  const addTask = async (title: string) => {
    let ok = false;
    await act(async () => {
      await api.createTask(p.id, title);
      ok = true;
    });
    return ok;
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
          className="font-semibold"
          onSave={(name) => act(() => api.updateProject(p.id, { name }))}
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
        {confirmDelete ? (
          <span className="confirm-delete ml-auto self-center text-xs text-destructive" role="alert">
            x pour supprimer le projet et toutes ses tâches (Log compris) · Échap pour annuler
          </span>
        ) : (
          <span className="actions invisible ml-auto flex gap-0.5 self-center group-hover:visible group-focus-within:visible">
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
            <Button
              variant="ghost"
              size="icon-xs"
              className="delete text-muted-foreground hover:text-destructive"
              aria-label="Supprimer le projet"
              title="Supprimer le projet (x x)"
              onClick={() => confirm(`Supprimer le projet « ${p.name} » et toutes ses tâches (y compris l'historique) ?`) && remove()}
            >
              <Trash2 aria-hidden />
            </Button>
          </span>
        )}
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
  showArchived: boolean;
  jiraOnly: boolean; // filtre « à reporter dans Jira »
  favoritesOnly: boolean;
}

export function ProjectList({ projects, showArchived, jiraOnly, favoritesOnly }: ProjectListProps) {
  const { act } = useActions();
  const visible = projects
    .filter((p) => showArchived || !p.archived_at)
    .filter((p) => !favoritesOnly || p.favorite_at)
    .map((p) => (jiraOnly ? { ...p, tasks: p.tasks.filter((t) => jiraState(t) === 'wanted') } : p))
    .filter((p) => !jiraOnly || p.tasks.length > 0);

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
    moving.current = true;
    await act(() => api.moveProject(project.id, index));
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
    await act(() => api.moveTask(task.id, target.projectId, target.index));
    moving.current = false;
  };

  const addProject = async (name: string) => {
    let ok = false;
    await act(async () => {
      const project = await api.createProject(name);
      ok = true;
      // Projet neuf, sans tâche : on enchaîne sur la saisie de la première.
      return { focus: `add:${project.id}` };
    });
    return ok;
  };

  return (
    <>
      <section id="projects" aria-label="Projets">
        {visible.map((p) => (
          // Liste filtrée : les positions affichées ne sont pas les vraies, pas de déplacement.
          <ProjectCard
            key={p.id}
            project={p}
            onMove={jiraOnly ? undefined : moveTask}
            onMoveProject={(direction) => moveProject(p, direction)}
          />
        ))}
        {!visible.length && (
          <p className="empty mt-3 italic text-muted-foreground">
            {jiraOnly
              ? 'Aucune tâche à faire à reporter.'
              : favoritesOnly
                ? 'Aucun projet favori : cliquez sur le cœur d’un projet.'
                : 'Aucun projet. Créez-en un ci-dessous.'}
          </p>
        )}
      </section>
      <AddInput id="new-project" className="mt-6 font-semibold" placeholder="+ Nouveau projet (p)" navKey="new-project" onAdd={addProject} />
    </>
  );
}
