import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { jiraState, type DoneTask, type JiraState, type Task } from '../../shared/types.ts';
import { api, type TaskPatch } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { focusByKey } from '@/lib/nav';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { EditableName } from './Editable';
import { JiraIcon } from './JiraIcon';

// Ligne de tâche, à faire (liste des projets) ou faite (journal).
// Clavier, où que soit le focus dans la ligne (hors champ de saisie) :
// Espace coche / décoche, J (majuscule) fait tourner le suivi Jira
// (rien -> à reporter -> reportée -> rien), L saisit le lien du ticket,
// x ou Suppr demande la suppression, un second appui la confirme,
// Alt+↑ / Alt+↓ (ou Alt+k / Alt+j) déplacent la tâche (onMove, tâches à faire).
export function TaskRow({ task, onMove }: { task: Task | DoneTask; onMove?: (direction: -1 | 1) => void }) {
  const { act, toast } = useActions();
  const done = 'done_at' in task;
  const [editingDate, setEditingDate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const navKey = `task:${task.id}`;

  const patch = (body: TaskPatch, stay = false) => act(() => api.updateTask(task.id, body), { stay });
  const toggleDone = () => patch(done ? { done: false } : { done: true, done_at: localToday() }, true);
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
      // Tout juste reportée (dernier appui) : on propose de coller le lien du ticket.
      if (next === 'done' && !j.pending && !task.jira_url) setEditingLink(true);
    });
  };

  // Lien vide = supprimé. Un lien renseigné vaut « reportée ».
  const saveLink = (value: string) => {
    if (value && !/^https?:\/\//i.test(value)) {
      toast('Lien invalide : adresse http(s) attendue');
      return;
    }
    setEditingLink(false);
    act(
      async () => {
        await api.updateTask(task.id, value ? { jira: 'done', jira_url: value } : { jira_url: null });
        return { focus: navKey };
      },
    );
  };
  // Le nom reste affiché à côté du champ : on peut lui rendre le focus tout de suite.
  const closeLink = () => {
    focusByKey(navKey);
    setEditingLink(false);
  };
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
      cycleJira();
    }
    if (e.key === 'L') {
      e.preventDefault();
      setEditingLink(true);
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
          navKey={navKey}
          className={done ? 'text-muted-foreground' : undefined}
          onSave={(title) => patch({ title })}
        />
        <JiraIcon task={task} />
        {editingLink && (
          <input
            className="edit jira-url min-w-0 flex-1 bg-transparent text-sm shadow-[0_1px_0_var(--color-primary)] outline-none placeholder:text-muted-foreground"
            placeholder="Lien Jira (https://…) · Entrée : enregistrer · Échap : passer"
            defaultValue={task.jira_url ?? ''}
            autoFocus
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveLink(e.currentTarget.value.trim());
              if (e.key === 'Escape') {
                e.stopPropagation();
                closeLink();
              }
            }}
            onBlur={() => setEditingLink(false)}
          />
        )}
      </span>
      {confirmDelete ? (
        <span className="confirm-delete text-xs text-destructive" role="alert">
          x pour supprimer · Échap pour annuler
        </span>
      ) : (
        <span className="actions invisible flex gap-0.5 group-hover:visible group-focus-within:visible">
          <Button variant="ghost" size="xs" className="text-muted-foreground" title="Suivi Jira : à reporter → reportée → rien (J)" onClick={cycleJira}>
            {{ none: 'jira', wanted: 'reportée', done: 'retirer jira' }[jiraState(task)]}
          </Button>
          <Button variant="ghost" size="xs" className="text-muted-foreground" title="Lien du ticket Jira (L)" onClick={() => setEditingLink(true)}>
            lien
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
