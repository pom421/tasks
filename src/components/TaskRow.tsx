import { useState } from 'react';
import type { DoneTask, Task } from '../../shared/types.ts';
import { api, type TaskPatch } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { localToday } from '@/lib/dates';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { EditableName } from './Editable';
import { JiraIcon } from './JiraIcon';

// Ligne de tâche, à faire (liste des projets) ou faite (journal).
// Clavier sur le nom : Espace coche / décoche, j bascule Jira, Suppr supprime.
export function TaskRow({ task }: { task: Task | DoneTask }) {
  const { act } = useActions();
  const done = 'done_at' in task;
  const [editingDate, setEditingDate] = useState(false);

  const patch = (body: TaskPatch, stay = false) => act(() => api.updateTask(task.id, body), { stay });
  const toggleDone = () => patch(done ? { done: false } : { done: true, done_at: localToday() }, true);
  const toggleJira = () => patch({ jira: !task.jira_at });
  const remove = () => {
    if (confirm(`Supprimer « ${task.title} » ?`)) act(() => api.deleteTask(task.id), { stay: true });
  };

  return (
    <li className="task group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent has-[.name:focus]:bg-accent has-[.name:focus]:shadow-[inset_3px_0_var(--color-primary)]">
      <Checkbox checked={done} onCheckedChange={toggleDone} title={done ? 'Remettre à faire' : 'Marquer comme faite'} />
      <span className="title flex min-w-0 flex-1 items-center gap-1.5">
        <EditableName
          value={task.title}
          navKey={`task:${task.id}`}
          className={done ? 'text-muted-foreground' : undefined}
          onSave={(title) => patch({ title })}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault();
              toggleDone();
            }
            if (e.key === 'j') {
              e.preventDefault();
              toggleJira();
            }
            if (e.key === 'Delete') remove();
          }}
        />
        {task.jira_at && <JiraIcon reportedAt={task.jira_at} />}
      </span>
      <span className="actions invisible flex gap-0.5 group-hover:visible group-focus-within:visible">
        <Button variant="ghost" size="xs" className="text-muted-foreground" title="Reportée dans Jira (j)" onClick={toggleJira}>
          {task.jira_at ? 'retirer jira' : 'jira'}
        </Button>
        {done &&
          (editingDate ? (
            <input
              type="date"
              className="text-xs"
              defaultValue={task.done_at}
              autoFocus
              onChange={(e) => e.target.value && patch({ done_at: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && setEditingDate(false)}
              onBlur={() => setEditingDate(false)}
            />
          ) : (
            <Button variant="ghost" size="xs" className="text-muted-foreground" title="Changer la date" onClick={() => setEditingDate(true)}>
              date
            </Button>
          ))}
        <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" title="Supprimer (Suppr)" onClick={remove}>
          ✕
        </Button>
      </span>
    </li>
  );
}
