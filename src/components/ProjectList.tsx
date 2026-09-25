import { useRef } from 'react';
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

function ProjectCard({ project: p, onMove, onMoveProject }: ProjectCardProps) {
  const { act, setLastProject } = useActions();
  const archived = Boolean(p.archived_at);

  const remove = () => {
    if (confirm(`Supprimer le projet « ${p.name} » et toutes ses tâches (y compris l'historique) ?`)) {
      act(() => api.deleteProject(p.id));
    }
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
        onKeyDown={(e) => {
          const direction = moveDirection(e);
          if (!direction) return;
          e.preventDefault();
          onMoveProject(direction);
        }}
        className="project-head group flex items-baseline gap-2 border-b pb-0.5 has-[.name:focus]:bg-accent has-[.name:focus]:pl-1.5 has-[.name:focus]:shadow-[inset_3px_0_var(--color-primary)]">
        <EditableName
          value={p.name}
          navKey={`project:${p.id}`}
          className="font-semibold"
          onSave={(name) => act(() => api.updateProject(p.id, { name }))}
        />
        <span className="count text-xs text-muted-foreground">{p.tasks.length || ''}</span>
        <span className="actions invisible ml-auto flex gap-0.5 group-hover:visible group-focus-within:visible">
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => act(() => api.updateProject(p.id, { archived: !archived }))}
          >
            {archived ? 'désarchiver' : 'archiver'}
          </Button>
          <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={remove}>
            supprimer
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
  showArchived: boolean;
  jiraOnly: boolean; // filtre « à reporter dans Jira »
}

export function ProjectList({ projects, showArchived, jiraOnly }: ProjectListProps) {
  const { act } = useActions();
  const visible = projects
    .filter((p) => showArchived || !p.archived_at)
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
            {jiraOnly ? 'Aucune tâche à faire à reporter.' : 'Aucun projet. Créez-en un ci-dessous.'}
          </p>
        )}
      </section>
      <AddInput id="new-project" className="mt-6 font-semibold" placeholder="+ Nouveau projet (p)" navKey="new-project" onAdd={addProject} />
    </>
  );
}
