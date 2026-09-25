import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { JIRA_KEY_RE, jiraLink, type DoneTask, type Settings, type Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import type { TaskField } from '@/lib/actions';
import { focusByKey } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface TaskDialogProps {
  task: Task | DoneTask;
  projectName: string;
  field: TaskField;
  settings: Settings;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onOpenSettings: () => void;
}

const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);

// Fiche d'une tâche : notes, lien et ticket Jira.
// Accessibilité : focus piégé dans la modale, Échap ferme, titre et
// description annoncés (Radix), libellés reliés aux champs, erreurs annoncées.
export function TaskDialog({ task, projectName, field, settings, open, onClose, onSaved, onOpenSettings }: TaskDialogProps) {
  const id = useId();
  const [notes, setNotes] = useState(task.notes ?? '');
  const [link, setLink] = useState(task.link ?? '');
  const [ticket, setTicket] = useState(task.jira_key ?? task.jira_url ?? '');
  const [errors, setErrors] = useState<{ link?: string; ticket?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const ticketKey = ticket.trim().toUpperCase();
  const isKey = JIRA_KEY_RE.test(ticketKey);
  const preview = isKey ? jiraLink({ jira_key: ticketKey, jira_url: null }, settings) : null;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const next = {
      link: link.trim() && !isHttpUrl(link.trim()) ? 'Adresse http(s) attendue, ex. https://…' : undefined,
      ticket:
        ticket.trim() && !isKey && !isHttpUrl(ticket.trim()) ? 'Clé (ex. PROJ-123) ou lien http(s) attendu' : undefined,
    };
    setErrors(next);
    if (next.link || next.ticket) return;
    setSaving(true);
    try {
      await api.updateTask(task.id, { notes: notes.trim() || null, link: link.trim() || null, jira_ticket: ticket.trim() || null });
      onSaved();
    } catch (err) {
      setErrors({ form: (err as Error).message });
      setSaving(false);
    }
  };

  // Ctrl/Cmd+Entrée enregistre depuis les notes (Entrée seule y fait un retour à la ligne).
  const onNotesKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
  };

  const state = 'done_at' in task ? `faite le ${task.done_at.split('-').reverse().join('/')}` : 'à faire';
  const describe = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        className="task-dialog sm:max-w-lg"
        // À la fermeture, retour sur la tâche dans la liste (même si la fiche a été
        // ouverte par J, sans élément déclencheur), pour reprendre la navigation.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusByKey(`task:${task.id}`);
        }}
      >
        <DialogTitle className="pr-6 leading-snug">{task.title}</DialogTitle>
        <DialogDescription>
          {projectName} · {state}
        </DialogDescription>

        <form className="grid gap-4" onSubmit={save} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-notes`}>Notes</Label>
            <Textarea
              id={`${id}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={onNotesKey}
              autoFocus={field === 'notes'}
              rows={4}
              aria-describedby={`${id}-notes-hint`}
            />
            <p id={`${id}-notes-hint`} className="text-xs text-muted-foreground">
              Ctrl+Entrée pour enregistrer.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-link`}>Lien</Label>
            <Input
              id={`${id}-link`}
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-invalid={Boolean(errors.link)}
              aria-describedby={describe(errors.link && `${id}-link-error`)}
            />
            {errors.link && (
              <p id={`${id}-link-error`} role="alert" className="text-xs text-destructive">
                {errors.link}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-jira`}>Ticket Jira</Label>
            <Input
              id={`${id}-jira`}
              placeholder="PROJ-123 ou lien complet"
              autoComplete="off"
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              autoFocus={field === 'jira'}
              aria-invalid={Boolean(errors.ticket)}
              aria-describedby={describe(`${id}-jira-hint`, errors.ticket && `${id}-jira-error`)}
            />
            <p id={`${id}-jira-hint`} className="jira-hint text-xs text-muted-foreground">
              {isKey && preview && <>Lien : {preview}</>}
              {isKey && !preview && (
                <>
                  Pour que la clé devienne un lien, renseignez l’URL de votre Jira dans les{' '}
                  <button type="button" className="underline underline-offset-2" onClick={onOpenSettings}>
                    réglages
                  </button>
                  .
                </>
              )}
              {!isKey && 'Renseigner un ticket marque la tâche « reportée dans Jira ».'}
            </p>
            {errors.ticket && (
              <p id={`${id}-jira-error`} role="alert" className="text-xs text-destructive">
                {errors.ticket}
              </p>
            )}
          </div>

          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
