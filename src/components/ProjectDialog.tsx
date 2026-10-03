import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BUGTRACKER_KEY_RE, bugtrackerLink, isValidTicket, type Project } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions, type TaskField } from '@/lib/actions';
import { record } from '@/lib/history';
import { focusByKey } from '@/lib/nav';
import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ProjectDialogProps {
  project: Project;
  field: TaskField;
  open: boolean;
  // changed : quelque chose a été enregistré (les données sont à recharger).
  onClose: (changed: boolean) => void;
}

type Field = 'name' | 'ticket' | 'notes';

// Fiche d'un projet, comme celle d'une tâche (même clavier, même disposition) :
// lecture seule par défaut ; e passe en édition (nom, puis Tab : ticket, contenu
// Markdown) ; Ctrl+Entrée enregistre et repasse en lecture ; un second
// Ctrl+Entrée (ou Échap) ferme. Enregistrement automatique, annulable (u).
export function ProjectDialog({ project, field, open, onClose }: ProjectDialogProps) {
  const id = useId();
  const { settings } = useActions();
  const [values, setValues] = useState({
    name: project.name,
    ticket: project.bugtracker_key ?? project.bugtracker_url ?? '',
    notes: project.notes ?? '',
  });
  const [editing, setEditing] = useState(field === 'edit');
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const saved = useRef({ ...values, changed: false });
  const refs = {
    name: useRef<HTMLInputElement>(null),
    ticket: useRef<HTMLInputElement>(null),
    notes: useRef<HTMLTextAreaElement>(null),
  };
  const reader = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(values.notes), [values.notes]);
  // Copie toujours à jour des valeurs saisies (voir TaskDialog).
  const latest = useRef(values);
  const set = (key: Field) => (e: { target: { value: string } }) => {
    latest.current = { ...latest.current, [key]: e.target.value };
    setValues(latest.current);
  };

  // Focus à placer juste après le prochain rendu (voir TaskDialog).
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

  const fail = (f: Field, message: string) => {
    setError({ field: f, message });
    setEditing(true);
    focusSoon(f);
    return false;
  };

  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const persist = (): Promise<boolean> => (queue.current = queue.current.then(save, save));

  // Enregistre ce qui a changé. false en cas d'erreur (la fiche reste ouverte).
  const save = async (): Promise<boolean> => {
    const values = latest.current;
    const ticket = values.ticket.trim();
    const next = {
      name: values.name.trim(),
      ticket: BUGTRACKER_KEY_RE.test(ticket.toUpperCase()) ? ticket.toUpperCase() : ticket,
      notes: values.notes.trim(),
    };
    if (!next.name) return fail('name', 'Le nom est obligatoire');
    if (!isValidTicket(next.ticket)) return fail('ticket', 'Identifiant attendu, ex. PROJ-123');
    const patch: Parameters<typeof api.updateProject>[1] = {};
    if (next.name !== saved.current.name) patch.name = next.name;
    if (next.ticket !== saved.current.ticket) patch.bugtracker_ticket = next.ticket || null;
    if (next.notes !== saved.current.notes.trim()) patch.notes = next.notes || null;
    if (!Object.keys(patch).length) return true;
    const before: typeof patch = {};
    if ('name' in patch) before.name = saved.current.name;
    if ('bugtracker_ticket' in patch) before.bugtracker_ticket = saved.current.ticket || null;
    if ('notes' in patch) before.notes = saved.current.notes.trim() || null;
    try {
      await api.updateProject(project.id, patch);
      record({
        label: 'modification de la fiche du projet',
        focus: `project:${project.id}`,
        undo: () => api.updateProject(project.id, before),
        redo: () => api.updateProject(project.id, patch),
      });
      saved.current = { ...next, changed: true };
      latest.current = { ...latest.current, ticket: next.ticket };
      setValues(latest.current);
      setError(null);
      return true;
    } catch (err) {
      return fail(patch.bugtracker_ticket !== undefined ? 'ticket' : 'name', (err as Error).message);
    }
  };

  const close = async () => {
    if (await persist()) onClose(saved.current.changed);
  };
  const startEditing = (focus: Field = 'name') => {
    setEditing(true);
    focusSoon(focus);
  };
  const stopEditing = async () => {
    setEditing(false);
    focusSoon('reader');
    await persist();
  };

  // Entrée dans le nom ou le ticket : comme Ctrl+Entrée.
  const onInputEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    stopEditing();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const inField = (e.target as HTMLElement).matches('input, textarea');
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

  const ticketKey = BUGTRACKER_KEY_RE.test(values.ticket.trim().toUpperCase()) ? values.ticket.trim().toUpperCase() : null;
  const ticketLink = values.ticket
    ? bugtrackerLink({ bugtracker_key: ticketKey, bugtracker_url: ticketKey ? null : values.ticket.trim() }, settings)
    : null;
  const count = project.tasks.length;
  const state = [project.archived_at && 'archivé', `${count} tâche${count > 1 ? 's' : ''} à faire`].filter(Boolean).join(' · ');
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
        className="project-dialog top-[5vh] flex max-h-[90vh] translate-y-0 flex-col gap-4 sm:max-w-3xl"
        onKeyDown={onKeyDown}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          close();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          ({ notes: reader, edit: refs.name }[field].current as HTMLElement | null)?.focus();
        }}
        // À la fermeture, retour sur le projet dans la liste.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusByKey(`project:${project.id}`);
        }}
      >
        <DialogTitle className={cn('pr-6 leading-snug [overflow-wrap:anywhere]', editing && 'sr-only')}>
          {values.name}
        </DialogTitle>
        {editing && (
          <div className="grid gap-1.5 pr-6">
            <Input
              ref={refs.name}
              aria-label="Nom"
              autoComplete="off"
              className="h-auto rounded-none border-0 border-b bg-transparent px-0 py-0 text-lg leading-snug font-semibold shadow-none focus-visible:border-primary focus-visible:ring-0 md:text-lg dark:bg-transparent"
              value={values.name}
              onChange={set('name')}
              onKeyDown={onInputEnter}
              {...invalid('name')}
            />
            {errorFor('name')}
          </div>
        )}
        <DialogDescription>Projet · {state}</DialogDescription>

        {editing ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid content-start gap-1.5">
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
            </div>
            <div className="grid min-h-0 flex-1 gap-1.5">
              <Label htmlFor={`${id}-notes`}>Contenu</Label>
              <Textarea
                ref={refs.notes}
                id={`${id}-notes`}
                className="min-h-[35vh] font-mono text-sm"
                value={values.notes}
                onChange={set('notes')}
                aria-describedby={`${id}-hint`}
              />
            </div>
          </>
        ) : (
          <div ref={reader} tabIndex={-1} className="reader grid min-h-0 flex-1 gap-4 outline-none" aria-describedby={`${id}-hint`}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Ticket :</dt>
              <dd className="ticket-value font-mono">
                {ticketLink ? (
                  <a
                    className="ticket-link text-primary underline-offset-2 hover:underline"
                    href={ticketLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir le ticket"
                  >
                    {values.ticket}
                  </a>
                ) : (
                  values.ticket || 'aucun'
                )}
              </dd>
            </dl>
            <div
              className={cn(
                'notes-preview markdown min-h-[35vh] overflow-y-auto rounded-md border px-3 py-2 text-sm',
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
