import type { Project } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AddInput, EditableName } from './Editable';
import { TaskRow } from './TaskRow';

function ProjectCard({ project: p }: { project: Project }) {
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
      <div className="project-head group flex items-baseline gap-2 border-b pb-0.5 has-[.name:focus]:bg-accent has-[.name:focus]:pl-1.5 has-[.name:focus]:shadow-[inset_3px_0_var(--color-primary)]">
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
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
      <AddInput
        placeholder="+ Ajouter une tâche"
        navKey={`add:${p.id}`}
        onFocus={() => setLastProject(p.id)}
        onAdd={addTask}
      />
    </div>
  );
}

export function ProjectList({ projects, showArchived }: { projects: Project[]; showArchived: boolean }) {
  const { act } = useActions();
  const visible = projects.filter((p) => showArchived || !p.archived_at);

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
          <ProjectCard key={p.id} project={p} />
        ))}
        {!visible.length && <p className="empty mt-3 italic text-muted-foreground">Aucun projet. Créez-en un ci-dessous.</p>}
      </section>
      <AddInput id="new-project" className="mt-6 font-semibold" placeholder="+ Nouveau projet (p)" navKey="new-project" onAdd={addProject} />
    </>
  );
}
