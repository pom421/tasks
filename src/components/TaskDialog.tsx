import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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

interface TaskDialogProps {
  task: Task | DoneTask;
  projectName: string;
  field: TaskField;
  open: boolean;
  // changed : quelque chose a été enregistré (les données sont à recharger).
  onClose: (changed: boolean) => void;
}

const ticketOf = (t: Task) => t.jira_key ?? t.jira_url ?? '';
const isValidTicket = (s: string) => !s || JIRA_KEY_RE.test(s.toUpperCase()) || /^https?:\/\/\S+$/i.test(s);

// Fiche d'une tâche : contenu en Markdown et identifiant du ticket.
// Contenu : aperçu par défaut ; e (comme GitLab), double-clic ou Entrée pour éditer ;
// Ctrl+Entrée revient à l'aperçu (et enregistre), un second Ctrl+Entrée ferme.
// Échap ferme aussi. Tout est enregistré automatiquement, rien n'est perdu.
// Accessibilité : focus piégé, titre et description annoncés (Radix),
// libellés reliés aux champs, erreurs annoncées.
export function TaskDialog({ task, projectName, field, open, onClose }: TaskDialogProps) {
  const id = useId();
  const [notes, setNotes] = useState(task.notes ?? '');
  const [ticket, setTicket] = useState(ticketOf(task));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef({ notes: task.notes ?? '', ticket: ticketOf(task), changed: false });
  const preview = useRef<HTMLDivElement>(null);
  const ticketInput = useRef<HTMLInputElement>(null);
  const html = useMemo(() => renderMarkdown(notes), [notes]);

  // Enregistre ce qui a changé. false si le ticket est invalide (la fiche reste ouverte).
  const persist = async (): Promise<boolean> => {
    const trimmed = { notes: notes.trim(), ticket: ticket.trim() };
    if (!isValidTicket(trimmed.ticket)) {
      setError('Identifiant attendu, ex. PROJ-123');
      ticketInput.current?.focus();
      return false;
    }
    const patch: Parameters<typeof api.updateTask>[1] = {};
    if (trimmed.notes !== saved.current.notes.trim()) patch.notes = trimmed.notes || null;
    if (trimmed.ticket !== saved.current.ticket) patch.jira_ticket = trimmed.ticket || null;
    if (!Object.keys(patch).length) return true;
    try {
      await api.updateTask(task.id, patch);
      saved.current = { notes, ticket: trimmed.ticket, changed: true };
      setError(null);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };

  const close = async () => {
    if (await persist()) onClose(saved.current.changed);
  };

  const startEditing = () => setEditing(true);
  const stopEditing = async () => {
    setEditing(false);
    await persist();
    requestAnimationFrame(() => preview.current?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // e : éditer le contenu, depuis n'importe où dans la fiche sauf un champ de saisie.
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

  const state = 'done_at' in task ? `faite le ${task.done_at.split('-').reverse().join('/')}` : 'à faire';

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent
        className="task-dialog flex max-h-[90vh] flex-col gap-4 sm:max-w-3xl"
        onKeyDown={onKeyDown}
        // Échap : fermer en enregistrant (et rester ouvert si le ticket est invalide).
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          close();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (field === 'jira' ? ticketInput.current : preview.current)?.focus();
        }}
        // À la fermeture, retour sur la tâche dans la liste pour reprendre la navigation.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusByKey(`task:${task.id}`);
        }}
      >
        <DialogTitle className="pr-6 leading-snug [overflow-wrap:anywhere]">{task.title}</DialogTitle>
        <DialogDescription>
          {projectName} · {state}
        </DialogDescription>

        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor={`${id}-ticket`}>Ticket</Label>
          <Input
            ref={ticketInput}
            id={`${id}-ticket`}
            placeholder="PROJ-123"
            autoComplete="off"
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.ctrlKey && !e.metaKey && close()}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>

        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid min-h-0 flex-1 gap-1.5">
          <Label id={`${id}-notes-label`} htmlFor={editing ? `${id}-notes` : undefined}>
            Contenu
          </Label>
          {editing ? (
            <Textarea
              id={`${id}-notes`}
              className="min-h-[50vh] font-mono text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoFocus
              aria-describedby={`${id}-notes-hint`}
            />
          ) : (
            <div
              ref={preview}
              tabIndex={0}
              role="document"
              aria-labelledby={`${id}-notes-label`}
              aria-describedby={`${id}-notes-hint`}
              className={cn(
                'notes-preview markdown min-h-[50vh] overflow-y-auto rounded-md border px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                !notes.trim() && 'text-muted-foreground italic',
              )}
              onDoubleClick={startEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  startEditing();
                }
              }}
              {...(notes.trim() ? { dangerouslySetInnerHTML: { __html: html } } : { children: 'Aucun contenu.' })}
            />
          )}
          <p id={`${id}-notes-hint`} className="text-xs text-muted-foreground">
            {editing
              ? 'Markdown · Ctrl+Entrée : aperçu'
              : 'e : modifier · Ctrl+Entrée ou Échap : fermer'}
          </p>
        </div>


        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
