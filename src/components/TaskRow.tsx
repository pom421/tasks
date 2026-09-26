import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { hasDetails, jiraState, type DoneTask, type JiraState, type Task } from '../../shared/types.ts';
import { NotebookText } from 'lucide-react';
import { api, type TaskPatch } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { EditableName } from './Editable';
import { ReportBadge } from './ReportBadge';
import { moveDirection } from '@/lib/nav';
import { PriorityBadge, usePriority } from './Priority';

// Ligne de tâche, à faire (liste des projets) ou faite (journal).
// Clavier, où que soit le focus dans la ligne (hors champ de saisie) :
// Espace coche / décoche, J (majuscule) fait tourner le suivi du report
// (rien -> à reporter -> reporté -> rien), o ou Maj+Entrée ouvre la fiche,
// e l'ouvre directement en édition,
// L l'ouvre sur l'identifiant du ticket,
// 1, 2, 3 donnent la priorité (la même touche la retire),
// x ou Suppr demande la suppression, un second appui la confirme,
// Alt+↑ / Alt+↓ (ou Alt+k / Alt+j) déplacent la tâche (onMove, tâches à faire).
export function TaskRow({ task, onMove }: { task: Task | DoneTask; onMove?: (direction: -1 | 1) => void }) {
  const { act, openTask, setUndo } = useActions();
  const done = 'done_at' in task;
  const [editingDate, setEditingDate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navKey = `task:${task.id}`;
  const priority = usePriority(task);

  const patch = (body: TaskPatch, stay = false) => act(() => api.updateTask(task.id, body), { stay });

  // Actions annulables (u) : l'annulation n'est mémorisée qu'une fois l'action réussie.
  const undoable = (label: string, run: () => Promise<unknown>, undo: () => Promise<unknown>, stay = false) =>
    act(
      async () => {
        await run();
        setUndo({ label, run: undo, focus: navKey });
      },
      { stay },
    );
  const toggleDone = () =>
    done
      ? undoable('tâche décochée', () => api.updateTask(task.id, { done: false }), () => api.updateTask(task.id, { done_at: task.done_at }), true)
      : undoable('tâche cochée', () => api.updateTask(task.id, { done: true, done_at: localToday() }), () => api.updateTask(task.id, { done: false }), true);
  const rename = (title: string) =>
    undoable('renommage', () => api.updateTask(task.id, { title }), () => api.updateTask(task.id, { title: task.title }));
  const NEXT: Record<JiraState, JiraState> = { none: 'wanted', wanted: 'done', done: 'none' };
  // J tapé plusieurs fois vite : chaque appui part du dernier état demandé
  // (pas de celui encore affiché) et les requêtes s'enchaînent dans l'ordre.
  const jira = useRef({ state: jiraState(task), pending: 0, queue: Promise.resolve() });
  if (!jira.current.pending) jira.current.state = jiraState(task);
  const cycleJira = () => {
    const j = jira.current;
    const next = NEXT[j.state];
    j.state = next;
    j.pending++;
    j.queue = j.queue.then(async () => {
      await patch({ jira: next });
      j.pending--;
      // Tout juste reportée (dernier appui) : on propose de renseigner le ticket.
      if (next === 'done' && !j.pending && !task.jira_key && !task.jira_url) openTask(task, 'jira');
    });
  };

  const remove = () => {
    let deleted: Record<string, unknown> | undefined;
    return undoable(
      'suppression',
      async () => (deleted = await api.deleteTask(task.id)),
      () => api.restoreTask(deleted!),
      true,
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    const target = e.target as HTMLElement;
    // Hors de la ligne (fiche ouverte dans une modale, rendue ailleurs dans le DOM) ou dans un champ : rien.
    if (!e.currentTarget.contains(target) || target.matches('input, textarea') || e.ctrlKey || e.metaKey) return;
    if (e.altKey) {
      const direction = moveDirection(e);
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
    if (priority.onKey(e)) return;
    if (e.key === ' ' && target.getAttribute('role') !== 'checkbox') {
      // Sur la case elle-même, Espace la coche nativement.
      e.preventDefault();
      toggleDone();
    }
    if (e.key === 'J') {
      e.preventDefault();
      cycleJira();
    }
    if (e.key === 'L' || e.key === 'o' || e.key === 'e' || (e.key === 'Enter' && e.shiftKey)) {
      e.preventDefault();
      openTask(task, e.key === 'L' ? 'jira' : e.key === 'e' ? 'edit' : 'notes');
    }
  };

  // Le focus quitte la ligne : la demande de suppression est abandonnée.
  const onBlur = (e: FocusEvent<HTMLLIElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setConfirmDelete(false);
  };

  return (
    <li
      className={cn(
        'task group flex min-w-0 items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent has-[.name:focus]:bg-accent has-[.name:focus]:shadow-[inset_3px_0_var(--color-primary)]',
        confirmDelete && 'bg-destructive/10 has-[.name:focus]:bg-destructive/10 has-[.name:focus]:shadow-[inset_3px_0_var(--color-destructive)]',
      )}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <Checkbox checked={done} onCheckedChange={toggleDone} title={done ? 'Remettre à faire' : 'Marquer comme faite'} />
      <span className="title flex min-w-0 flex-1 items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <EditableName
          value={task.title}
          navKey={navKey}
          // Toute la largeur jusqu'aux icônes : un clic n'importe où sur la ligne
          // passe le titre en édition (et donne le curseur clavier à la tâche).
          className={cn('flex-1', done && 'text-muted-foreground line-through')}
          truncate
          onSave={rename}
        />
        <ReportBadge task={task} />
        {hasDetails(task) && (
          <button
            type="button"
            tabIndex={-1}
            className="details flex-none text-muted-foreground hover:text-foreground"
            title="Voir le contenu (o ou Maj+Entrée)"
            aria-label="Voir les détails"
            onClick={() => openTask(task, 'notes')}
          >
            <NotebookText className="size-3.5" aria-hidden />
          </button>
        )}
      </span>
      {confirmDelete ? (
        <span className="confirm-delete flex-none text-xs text-destructive" role="alert">
          x pour supprimer · Échap pour annuler
        </span>
      ) : (
        done && (
          <span className="actions invisible flex flex-none gap-0.5 group-hover:visible group-focus-within:visible">
            {editingDate ? (
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
            )}
          </span>
        )
      )}
    </li>
  );
}
