import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { JIRA_KEY_RE, type DoneTask, type Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import type { TaskField } from '@/lib/actions';
import { focusByKey } from '@/lib/nav';
import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TimerButtons, useTimer } from './Timer';
import { PlanButton, usePlan } from './Plan';
import { PriorityButton, usePriority } from './Priority';

interface TaskDialogProps {
  task: Task | DoneTask;
  projectName: string;
  field: TaskField;
  open: boolean;
  // changed : quelque chose a été enregistré (les données sont à recharger).
  onClose: (changed: boolean) => void;
}

type Field = 'title' | 'ticket' | 'notes';

const ticketOf = (t: Task) => t.jira_key ?? t.jira_url ?? '';
const isValidTicket = (s: string) => !s || JIRA_KEY_RE.test(s.toUpperCase()) || /^https?:\/\/\S+$/i.test(s);

// Fiche d'une tâche, façon GitLab : lecture seule par défaut ; e passe tout en
// édition (titre, puis Tab : ticket, puis contenu Markdown) ; Ctrl+Entrée
// enregistre et repasse en lecture ; un second Ctrl+Entrée (ou Échap) ferme.
// Chrono comme sur la ligne : c lance / met en pause, C remet à zéro.
// Plan journée comme sur la ligne : t ou ☀.
// Priorité comme sur la ligne : p (ou clic sur l'icône).
// Tout est enregistré automatiquement, rien n'est perdu.
// Accessibilité : focus piégé, titre et description annoncés (Radix),
// libellés reliés aux champs, erreurs annoncées.
export function TaskDialog({ task, projectName, field, open, onClose }: TaskDialogProps) {
  const id = useId();
  const done = 'done_at' in task;
  const timer = useTimer(task);
  const plan = usePlan(task);
  const priority = usePriority(task);
  const [values, setValues] = useState({ title: task.title, ticket: ticketOf(task), notes: task.notes ?? '' });
  // Ouverte par e (édition complète) ou sur le ticket (L, J → reporté) : directement en édition.
  const [editing, setEditing] = useState(field !== 'notes');
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const saved = useRef({ ...values, changed: false });
  const refs = {
    title: useRef<HTMLInputElement>(null),
    ticket: useRef<HTMLInputElement>(null),
    notes: useRef<HTMLTextAreaElement>(null),
  };
  const reader = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(values.notes), [values.notes]);
  // Copie toujours à jour des valeurs saisies : Radix appelle parfois un
  // gestionnaire (Échap) d'un rendu précédent, qui enregistrerait un texte périmé.
  const latest = useRef(values);
  const set = (key: Field) => (e: { target: { value: string } }) => {
    latest.current = { ...latest.current, [key]: e.target.value };
    setValues(latest.current);
  };

  // Focus à placer dès le prochain affichage (le champ visé n'existe pas encore
  // quand on change de mode). Appliqué juste après le rendu, avant la touche
  // suivante : si on tape vite après e puis Tab, rien ne revient en arrière.
  const focusNext = useRef<Field | 'reader' | null>(null);
  const [, rerender] = useState(0);
  useLayoutEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    (target === 'reader' ? reader.current : refs[target].current)?.focus();
  });
  const focusSoon = (target: Field | 'reader') => {
    focusNext.current = target;
    rerender((n) => n + 1);
  };

  // En édition, un champ en erreur est corrigé sur place ; en lecture, on y revient.
  const fail = (f: Field, message: string) => {
    setError({ field: f, message });
    setEditing(true);
    focusSoon(f);
    return false;
  };

  // Enregistrements en file : deux Ctrl+Entrée rapides (lecture puis fermeture)
  // ne lancent pas deux enregistrements concurrents.
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const persist = (): Promise<boolean> => (queue.current = queue.current.then(save, save));

  // Enregistre ce qui a changé. false en cas d'erreur (la fiche reste ouverte).
  const save = async (): Promise<boolean> => {
    const values = latest.current;
    const ticket = values.ticket.trim();
    const next = {
      title: values.title.trim(),
      // Identifiant normalisé comme côté serveur (proj-5 → PROJ-5).
      ticket: JIRA_KEY_RE.test(ticket.toUpperCase()) ? ticket.toUpperCase() : ticket,
      notes: values.notes.trim(),
    };
    if (!next.title) return fail('title', 'Le titre est obligatoire');
    if (!isValidTicket(next.ticket)) return fail('ticket', 'Identifiant attendu, ex. PROJ-123');
    const patch: Parameters<typeof api.updateTask>[1] = {};
    if (next.title !== saved.current.title) patch.title = next.title;
    if (next.ticket !== saved.current.ticket) patch.jira_ticket = next.ticket || null;
    if (next.notes !== saved.current.notes.trim()) patch.notes = next.notes || null;
    if (!Object.keys(patch).length) return true;
    try {
      await api.updateTask(task.id, patch);
      saved.current = { ...next, changed: true };
      latest.current = { ...latest.current, ticket: next.ticket };
      setValues(latest.current);
      setError(null);
      return true;
    } catch (err) {
      return fail(patch.jira_ticket !== undefined ? 'ticket' : 'title', (err as Error).message);
    }
  };

  const close = async () => {
    if (await persist()) onClose(saved.current.changed);
  };

  const startEditing = (focus: Field = 'title') => {
    setEditing(true);
    focusSoon(focus);
  };
  // Passage en lecture immédiat ; une erreur d'enregistrement ramène en édition.
  const stopEditing = async () => {
    setEditing(false);
    focusSoon('reader');
    await persist();
  };

  // Entrée dans le titre ou le ticket : comme Ctrl+Entrée. Fiche ouverte juste
  // pour saisir le ticket (L, J → reporté) : Entrée enregistre et ferme.
  const onInputEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (field === 'jira') close();
    else stopEditing();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const inField = (e.target as HTMLElement).matches('input, textarea');
    if (!inField && !done && !e.ctrlKey && !e.metaKey && !e.altKey && timer.onKey(e)) return;
    if (!inField && !done && !e.ctrlKey && !e.metaKey && !e.altKey && plan.onKey(e)) return;
    if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && priority.onKey(e)) return;
    if (e.key === 'e' && !editing && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startEditing();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (editing) stopEditing();
      else close();
    }
  };

  const state = done ? `faite le ${task.done_at.split('-').reverse().join('/')}` : 'à faire';
  const errorFor = (f: Field) =>
    error?.field === f && (
      <p id={`${id}-${f}-error`} role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    );
  const invalid = (f: Field) => ({
    'aria-invalid': error?.field === f,
    'aria-describedby': error?.field === f ? `${id}-${f}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent
        className="task-dialog top-[5vh] flex max-h-[90vh] translate-y-0 flex-col gap-4 sm:max-w-3xl"
        onKeyDown={onKeyDown}
        // Échap : fermer en enregistrant (et rester ouvert en cas d'erreur).
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          close();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          ({ notes: reader, edit: refs.title, jira: refs.ticket }[field].current as HTMLElement | null)?.focus();
        }}
        // À la fermeture, retour sur la tâche dans la liste pour reprendre la navigation.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusByKey(`task:${task.id}`);
        }}
      >
        {/* Même disposition en lecture et en édition : titre en haut (jusqu'à la
            croix), puis projet et icônes. En édition, le champ prend la place du
            titre, qui reste annoncé par Radix. */}
        <DialogTitle className={cn('pr-6 leading-snug [overflow-wrap:anywhere]', editing && 'sr-only')}>
          {values.title}
        </DialogTitle>
        {editing && (
          <div className="grid gap-1.5 pr-6">
            <Input
              ref={refs.title}
              id={`${id}-title`}
              aria-label="Titre"
              autoComplete="off"
              className="h-auto rounded-none border-0 border-b bg-transparent px-0 py-0 text-lg leading-snug font-semibold shadow-none focus-visible:border-primary focus-visible:ring-0 md:text-lg dark:bg-transparent"
              value={values.title}
              onChange={set('title')}
              onKeyDown={onInputEnter}
              {...invalid('title')}
            />
            {errorFor('title')}
          </div>
        )}
        {/* Icônes de la tâche à droite, comme sur la ligne. */}
        <div className="flex min-h-6 items-center justify-between gap-2">
          <DialogDescription>
            {projectName} · {state}
          </DialogDescription>
          <span className="flex">
            {!done && <TimerButtons timer={timer} />}
            {!done && <PlanButton plan={plan} />}
            <PriorityButton priority={task.priority} onClick={priority.cycle} />
          </span>
        </div>

        {editing ? (
          <>
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor={`${id}-ticket`}>Ticket</Label>
              <Input
                ref={refs.ticket}
                id={`${id}-ticket`}
                placeholder="PROJ-123"
                autoComplete="off"
                value={values.ticket}
                onChange={set('ticket')}
                onKeyDown={onInputEnter}
                {...invalid('ticket')}
              />
              {errorFor('ticket')}
            </div>
            <div className="grid min-h-0 flex-1 gap-1.5">
              <Label htmlFor={`${id}-notes`}>Contenu</Label>
              <Textarea
                ref={refs.notes}
                id={`${id}-notes`}
                className="min-h-[45vh] font-mono text-sm"
                value={values.notes}
                onChange={set('notes')}
                aria-describedby={`${id}-hint`}
              />
            </div>
          </>
        ) : (
          <div
            ref={reader}
            tabIndex={-1}
            className="reader grid min-h-0 flex-1 gap-4 outline-none"
            aria-describedby={`${id}-hint`}
          >
            <p className="text-sm">
              <span className="text-muted-foreground">Ticket : </span>
              <span className="ticket-value font-mono">{values.ticket || 'aucun'}</span>
            </p>
            <div
              className={cn(
                'notes-preview markdown min-h-[45vh] overflow-y-auto rounded-md border px-3 py-2 text-sm',
                !values.notes.trim() && 'text-muted-foreground italic',
              )}
              onDoubleClick={() => startEditing('notes')}
              {...(values.notes.trim() ? { dangerouslySetInnerHTML: { __html: html } } : { children: 'Aucun contenu.' })}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {editing
              ? 'Tab : champ suivant · Ctrl+Entrée : enregistrer et repasser en lecture'
              : 'e : modifier · Ctrl+Entrée ou Échap : fermer'}
          </p>
          <DialogFooter>
            <Button type="button" onClick={close}>
              Fermer
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
