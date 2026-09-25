import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { DoneTask, Task } from '../../shared/types.ts';
import { api, type TaskPatch } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { EditableName } from './Editable';
import { JiraIcon } from './JiraIcon';

// Ligne de tâche, à faire (liste des projets) ou faite (journal).
// Clavier, où que soit le focus dans la ligne (hors champ de saisie) :
// Espace coche / décoche, J (majuscule) bascule Jira,
// x ou Suppr demande la suppression, un second appui la confirme,
// Alt+↑ / Alt+↓ (ou Alt+k / Alt+j) déplacent la tâche (onMove, tâches à faire).
export function TaskRow({ task, onMove }: { task: Task | DoneTask; onMove?: (direction: -1 | 1) => void }) {
  const { act } = useActions();
  const done = 'done_at' in task;
  const [editingDate, setEditingDate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (body: TaskPatch, stay = false) => act(() => api.updateTask(task.id, body), { stay });
  const toggleDone = () => patch(done ? { done: false } : { done: true, done_at: localToday() }, true);
  const toggleJira = () => patch({ jira: !task.jira_at });
  const remove = () => act(() => api.deleteTask(task.id), { stay: true });

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    const target = e.target as HTMLElement;
    if (target.matches('input') || e.ctrlKey || e.metaKey) return;
    if (e.altKey) {
      // e.code : sur macOS, Alt+j produit « ∆ » dans e.key.
      const direction = { ArrowUp: -1, KeyK: -1, ArrowDown: 1, KeyJ: 1 }[e.code] as -1 | 1 | undefined;
      if (direction && onMove) {
        e.preventDefault();
        setConfirmDelete(false);
        onMove(direction);
      }
      return;
    }
    if (e.key === 'x' || e.key === 'Delete') {
      e.preventDefault();
      if (confirmDelete) remove();
      else setConfirmDelete(true);
      return;
    }
    if (confirmDelete && e.key === 'Escape') e.stopPropagation();
    setConfirmDelete(false); // toute autre touche annule la demande
    if (e.key === ' ' && target.getAttribute('role') !== 'checkbox') {
      // Sur la case elle-même, Espace la coche nativement.
      e.preventDefault();
      toggleDone();
    }
    if (e.key === 'J') {
      e.preventDefault();
      toggleJira();
    }
  };

  // Le focus quitte la ligne : la demande de suppression est abandonnée.
  const onBlur = (e: FocusEvent<HTMLLIElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setConfirmDelete(false);
  };

  return (
    <li
      className={cn(
        'task group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent has-[.name:focus]:bg-accent has-[.name:focus]:shadow-[inset_3px_0_var(--color-primary)]',
        confirmDelete && 'bg-destructive/10 has-[.name:focus]:bg-destructive/10 has-[.name:focus]:shadow-[inset_3px_0_var(--color-destructive)]',
      )}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <Checkbox checked={done} onCheckedChange={toggleDone} title={done ? 'Remettre à faire' : 'Marquer comme faite'} />
      <span className="title flex min-w-0 flex-1 items-center gap-1.5">
        <EditableName
          value={task.title}
          navKey={`task:${task.id}`}
          className={done ? 'text-muted-foreground' : undefined}
          onSave={(title) => patch({ title })}
        />
        {task.jira_at && <JiraIcon reportedAt={task.jira_at} />}
      </span>
      {confirmDelete ? (
        <span className="confirm-delete text-xs text-destructive" role="alert">
          x pour supprimer · Échap pour annuler
        </span>
      ) : (
        <span className="actions invisible flex gap-0.5 group-hover:visible group-focus-within:visible">
          <Button variant="ghost" size="xs" className="text-muted-foreground" title="Reportée dans Jira (J)" onClick={toggleJira}>
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
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-destructive"
            title="Supprimer (x x)"
            onClick={() => confirm(`Supprimer « ${task.title} » ?`) && remove()}
          >
            ✕
          </Button>
        </span>
      )}
    </li>
  );
}
