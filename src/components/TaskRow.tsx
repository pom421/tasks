import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { hasDetails, type DoneTask, type Task } from '../../shared/types.ts';
import { NotebookText } from 'lucide-react';
import { api, type TaskPatch } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { splitMatches } from '@/lib/highlight';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { EditableName } from './Editable';
import { ReportBadge } from './ReportBadge';
import { TicketInput, useReport } from './Report';
import { focusByKey, moveDirection } from '@/lib/nav';
import { TimeSpent, TimerButtons, useTimer } from './Timer';
import { PlanButton, usePlan } from './Plan';
import { PriorityButton, usePriority } from './Priority';
import { DueDate, PlannedDate, TaskTags } from './TaskDates';

// Ligne de tâche, à faire (liste des projets) ou faite (journal).
// Clavier, où que soit le focus dans la ligne (hors champ de saisie) :
// Espace coche / décoche, r fait tourner le suivi du report
// (rien -> à reporter -> ticket demandé : reporté -> rien), o ou Maj+Entrée ouvre la fiche,
// e l'ouvre directement en édition,
// c lance / met en pause le chrono, C l'arrête et le remet à zéro (tâches à faire),
// t l'ajoute à Aujourd’hui ou l'en retire (tâches à faire),
// 1, 2, 3 donnent la priorité (le même chiffre la retire),
// x ou Suppr demande la suppression, un second appui la confirme,
// Alt+↑ / Alt+↓ (ou Alt+k / Alt+j) déplacent la tâche (onMove, tâches à faire).
// highlight : recherche du Log, soulignée dans le titre.
export function TaskRow({ task, onMove, highlight = '' }: { task: Task | DoneTask; onMove?: (direction: -1 | 1) => void; highlight?: string }) {
  const { openTask, undoable } = useActions();
  const done = 'done_at' in task;
  const [editingDate, setEditingDate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navKey = `task:${task.id}`;
  const timer = useTimer(task);
  const plan = usePlan(task);
  const priority = usePriority(task);
  // Report : r ; sur une tâche à reporter, l'identifiant est demandé dans la ligne.
  const report = useReport(task);

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
      report.cycle();
    }
    if (e.key === 'o' || e.key === 'e' || (e.key === 'Enter' && e.shiftKey)) {
      e.preventDefault();
      openTask(task, e.key === 'e' ? 'edit' : 'notes');
    }
  };

  // Ligne 2 (tags à gauche ; dates et temps passé à droite), seulement si elle a quelque chose à montrer.
  // Tâche faite (Log) : une seule ligne, tags et temps passé au bout du titre.
  const secondLine =
    !done && (task.tags.length > 0 || Boolean(task.due_at) || Boolean(task.day_at) || timer.running || timer.seconds > 0);

  // Le focus quitte la ligne : la demande de suppression est abandonnée.
  const onBlur = (e: FocusEvent<HTMLLIElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setConfirmDelete(false);
  };

  return (
    <li
      className={cn(
        'task group flex min-w-0 flex-col rounded px-1 py-0.5 text-sm hover:bg-accent has-[.name:focus]:bg-accent has-[.name:focus]:shadow-[inset_3px_0_var(--color-primary)]',
        confirmDelete && 'bg-destructive/10 has-[.name:focus]:bg-destructive/10 has-[.name:focus]:shadow-[inset_3px_0_var(--color-destructive)]',
      )}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox checked={done} onCheckedChange={toggleDone} title={done ? 'Remettre à faire' : 'Marquer comme faite'} />
        <span className="title flex min-w-0 flex-1 items-center gap-1.5">
          <EditableName
            value={task.title}
            display={splitMatches(task.title, highlight).map((part, i) =>
              part.match ? (
                <mark key={i} className="search-match bg-transparent text-foreground underline decoration-search-mark decoration-[3px] underline-offset-2 [text-decoration-skip-ink:none]">
                  {part.text}
                </mark>
              ) : (
                part.text
              ),
            )}
            navKey={navKey}
            // Toute la largeur jusqu'aux icônes : un clic n'importe où sur la ligne
            // passe le titre en édition (et donne le curseur clavier à la tâche).
            className={cn('flex-1', done && 'text-muted-foreground line-through')}
            truncate
            onSave={rename}
          />
          {report.asking ? (
            <TicketInput
              onSave={report.save}
              onClose={(saved) => {
                focusByKey(navKey);
                report.stopAsking(saved);
              }}
            />
          ) : (
            <ReportBadge task={task} />
          )}
          {done && (
            <>
              <TaskTags tags={task.tags} className="max-w-[35%] flex-none" />
              <TimeSpent timer={timer} className="text-[11px] [&_svg]:size-3" />
            </>
          )}
        </span>
        {/* Icônes : emplacements fixes, toujours à la même place d'une ligne à
            l'autre (une icône sans objet garde sa place, invisible). */}
        {!confirmDelete && (
          <Button
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            className={cn('details flex-none text-muted-foreground', !hasDetails(task) && 'invisible')}
            title="Voir le contenu (o ou Maj+Entrée)"
            aria-label="Voir les détails"
            aria-hidden={!hasDetails(task) || undefined}
            onClick={() => openTask(task, 'notes')}
          >
            <NotebookText aria-hidden />
          </Button>
        )}
        {!done && !confirmDelete && <PlanButton plan={plan} hidden />}
        {!confirmDelete && <PriorityButton priority={task.priority} onClick={priority.cycle} hidden />}
        {/* Chrono, tout à droite (▷ au-dessus du temps passé de la 2e ligne) : visible
            au survol, toujours visible en marche (icône pause pleine). */}
        {!done && !confirmDelete && (
          <TimerButtons
            timer={timer}
            className={timer.running ? undefined : 'invisible group-hover:visible group-focus-within:visible'}
          />
        )}
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
      </div>
      {/* Ligne 2, sous le titre (décalée de la case) : tags, puis à droite date
          prévue, échéance et temps passé. Échéance et temps : emplacements
          de largeur fixe, gardés vides, alignés d'une ligne à l'autre. */}
      {secondLine && (
        <div className="details-line flex min-w-0 items-center gap-2 pl-6 leading-[18px]">
          <TaskTags tags={task.tags} />
          <span className="ml-auto flex flex-none items-center gap-2">
            <PlannedDate day={task.day_at} />
            <DueDate due={task.due_at} />
            <span className="flex w-[3.75rem] flex-none justify-end">
              <TimeSpent timer={timer} className="text-[11px] [&_svg]:size-3" />
            </span>
          </span>
        </div>
      )}
    </li>
  );
}
