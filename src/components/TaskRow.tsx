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
import { TimerButtons, useTimer } from './Timer';
import { PlanButton, usePlan } from './Plan';
import { PriorityButton, usePriority } from './Priority';

// Ligne de tâche, à faire (liste des projets) ou faite (journal).
// Clavier, où que soit le focus dans la ligne (hors champ de saisie) :
// Espace coche / décoche, r fait tourner le suivi du report
// (rien -> à reporter -> reporté -> rien), o ou Maj+Entrée ouvre la fiche,
// e l'ouvre directement en édition,
// L l'ouvre sur l'identifiant du ticket,
// c lance / met en pause le chrono, C l'arrête et le remet à zéro (tâches à faire),
// t l'ajoute au plan journée ou l'en retire (tâches à faire),
// 1, 2, 3 donnent la priorité (le même chiffre la retire),
// x ou Suppr demande la suppression, un second appui la confirme,
// Alt+↑ / Alt+↓ (ou Alt+k / Alt+j) déplacent la tâche (onMove, tâches à faire).
export function TaskRow({ task, onMove }: { task: Task | DoneTask; onMove?: (direction: -1 | 1) => void }) {
  const { openTask, undoable } = useActions();
  const done = 'done_at' in task;
  const [editingDate, setEditingDate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navKey = `task:${task.id}`;
  const timer = useTimer(task);
  const plan = usePlan(task);
  const priority = usePriority(task);

  // Modification annulable (u) et rejouable (U) : before = valeurs d'avant.
  const change = (label: string, patch: TaskPatch, before: TaskPatch, stay = false) =>
    undoable({
      label,
      focus: navKey,
      run: () => api.updateTask(task.id, patch),
      undo: () => api.updateTask(task.id, before),
      stay,
    });
  const toggleDone = () =>
    done
      ? change('tâche décochée', { done: false }, { done_at: task.done_at }, true)
      : change('tâche cochée', { done: true, done_at: localToday() }, { done: false }, true);
  const rename = (title: string) => change('renommage', { title }, { title: task.title });
  const NEXT: Record<JiraState, JiraState> = { none: 'wanted', wanted: 'done', done: 'none' };
  const JIRA_LABEL: Record<JiraState, string> = { none: 'retrait du report', wanted: 'à reporter', done: 'reportée' };
  // r tapé plusieurs fois vite : chaque appui part du dernier état demandé
  // (pas de celui encore affiché) et les requêtes s'enchaînent dans l'ordre.
  const jira = useRef({ state: jiraState(task), pending: 0, queue: Promise.resolve() });
  if (!jira.current.pending) jira.current.state = jiraState(task);
  const cycleJira = () => {
    const j = jira.current;
    const before = j.state;
    const next = NEXT[before];
    j.state = next;
    j.pending++;
    j.queue = j.queue.then(async () => {
      await change(JIRA_LABEL[next], { jira: next }, { jira: before });
      j.pending--;
      // Tout juste reportée (dernier appui) : on propose de renseigner le ticket.
      if (next === 'done' && !j.pending && !task.jira_key && !task.jira_url) openTask(task, 'jira');
    });
  };

  const remove = () => {
    let deleted: Record<string, unknown> | undefined;
    return undoable({
      label: 'suppression',
      focus: navKey,
      run: async () => (deleted = await api.deleteTask(task.id)),
      undo: () => api.restoreTask(deleted!),
      stay: true,
    });
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
    if (!done && timer.onKey(e)) {
      setConfirmDelete(false);
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
    if (!done && plan.onKey(e)) return;
    if (e.key === 'r') {
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
          <Button
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            className="details flex-none text-muted-foreground"
            title="Voir le contenu (o ou Maj+Entrée)"
            aria-label="Voir les détails"
            onClick={() => openTask(task, 'notes')}
          >
            <NotebookText aria-hidden />
          </Button>
        )}
      </span>
      {/* Chrono : visible au survol, toujours visible en marche (icône pause pleine). */}
      {!done && !confirmDelete && (
        <TimerButtons
          timer={timer}
          className={timer.running ? undefined : 'invisible group-hover:visible group-focus-within:visible'}
        />
      )}
      {!done && !confirmDelete && <PlanButton plan={plan} hidden />}
      {!confirmDelete && <PriorityButton priority={task.priority} onClick={priority.cycle} hidden />}
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
                onChange={(e) => e.target.value && change('date changée', { done_at: e.target.value }, { done_at: task.done_at })}
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
