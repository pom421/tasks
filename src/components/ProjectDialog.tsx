import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ListChecks } from 'lucide-react';
import { BUGTRACKER_KEY_RE, bugtrackerLink, isValidTicket, type Project, type Summaries } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions, type ProjectField } from '@/lib/actions';
import { record } from '@/lib/history';
import { focusByKey } from '@/lib/nav';
import { TASK_LINK, renderMarkdown } from '@/lib/markdown';
import { formatDay, localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PriorityIcon } from './Priority';

interface ProjectDialogProps {
  project: Project;
  field: ProjectField;
  open: boolean;
  // changed : quelque chose a été enregistré (les données sont à recharger).
  onClose: (changed: boolean) => void;
  onOpenTask: (id: number) => void; // lien de la synthèse vers une tâche
}

// Lignes de liste Markdown, une par tâche : titre lié à sa fiche (#tache-12).
const taskLines = (tasks: { id: number; title: string }[]) =>
  tasks.map((t) => `- [${t.title.replace(/[[\]]/g, '\\$&')}](#tache-${t.id})`).join('\n');

// Structure proposée d'une synthèse vide (texte d'aide du champ, pas du contenu).
const SUMMARY_HINT = '## Le projet\nCe qu’il est, liens utiles…\n\n## Fait récemment\n\n## Prochaines étapes';

type Field = 'name' | 'ticket' | 'notes';

// Fiche d'un projet, comme celle d'une tâche (même clavier, même disposition) :
// lecture seule par défaut ; e passe en édition (nom, puis Tab : ticket,
// synthèse) ; s ouvre directement la synthèse en édition ; Ctrl+Entrée
// enregistre et repasse en lecture ; un second Ctrl+Entrée (ou Échap) ferme.
// Enregistrement automatique, annulable (u).
// Synthèse : Markdown libre (le projet et ses liens, fait récemment, prochaines
// étapes), une version par jour ; en édition, deux boutons insèrent les tâches
// faites depuis la version d'avant et les P1, en liens vers leur fiche ; en
// lecture, les versions passées se consultent et se restaurent.
export function ProjectDialog({ project, field, open, onClose, onOpenTask }: ProjectDialogProps) {
  const id = useId();
  const { settings } = useActions();
  const [values, setValues] = useState({
    name: project.name,
    ticket: project.bugtracker_key ?? '',
    notes: project.notes ?? '',
  });
  const [editing, setEditing] = useState(field !== 'notes');
  // Versions de la synthèse et tâches faites depuis la version d'avant (lues à l'ouverture).
  const today = useMemo(localToday, []);
  const [summaries, setSummaries] = useState<Summaries>({ versions: [], recent: [] });
  useEffect(() => {
    api.summaries(project.id, today).then(setSummaries, () => {});
  }, [project.id, today]);
  // Version affichée en lecture : '' = la plus récente (celle qu'on modifie).
  const [shownDay, setShownDay] = useState('');
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const saved = useRef({ ...values, changed: false });
  const refs = {
    name: useRef<HTMLInputElement>(null),
    ticket: useRef<HTMLInputElement>(null),
    notes: useRef<HTMLTextAreaElement>(null),
  };
  const reader = useRef<HTMLDivElement>(null);
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
    const next = {
      name: values.name.trim(),
      ticket: values.ticket.trim().toUpperCase(), // normalisé comme côté serveur (proj-5 → PROJ-5)
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
    // La synthèse est datée du jour : sa version du jour (annuler y revient aussi).
    if ('notes' in patch) {
      Object.assign(patch, { day: today });
      Object.assign(before, { day: today });
    }
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
    void stopEditing();
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
      if (editing) void stopEditing();
      else void close();
    }
  };

  // Insère du texte à la place de la sélection de la synthèse (ou au curseur).
  const insert = (text: string) => {
    const area = refs.notes.current;
    const value = latest.current.notes;
    const [start, end] = area ? [area.selectionStart, area.selectionEnd] : [value.length, value.length];
    const before = value.slice(0, start);
    const block = (before && !before.endsWith('\n') ? '\n' : '') + text + '\n';
    latest.current = { ...latest.current, notes: before + block + value.slice(end) };
    setValues(latest.current);
    const cursor = start + block.length;
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(cursor, cursor);
    });
  };
  const p1 = project.tasks.filter((t) => t.priority === 1);

  // Lien vers une tâche (#tache-12) : ouvre sa fiche, après avoir enregistré.
  const onPreviewClick = async (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    const id = link?.getAttribute('href')?.match(TASK_LINK)?.[1];
    if (!id) return;
    e.preventDefault();
    if (await persist()) onOpenTask(Number(id));
  };

  // Version passée affichée : son contenu, sans modification possible ; « Restaurer »
  // en fait la synthèse du jour (annulable, u).
  const shown = shownDay ? summaries.versions.find((v) => v.day === shownDay) : undefined;
  const shownNotes = shown ? shown.content : values.notes;
  const shownHtml = useMemo(() => renderMarkdown(shownNotes), [shownNotes]);
  const restore = async () => {
    if (!shown) return;
    latest.current = { ...latest.current, notes: shown.content };
    setValues(latest.current);
    setShownDay('');
    await persist();
  };

  const ticketKey = values.ticket.trim().toUpperCase();
  const ticketLink = BUGTRACKER_KEY_RE.test(ticketKey) ? bugtrackerLink({ bugtracker_key: ticketKey }, settings) : null;
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
          void close();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          ({ notes: reader, edit: refs.name, summary: refs.notes }[field].current as HTMLElement | null)?.focus();
        }}
        // À la fermeture, retour sur le projet dans la liste.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusByKey(`project:${project.id}`);
        }}
      >
        <DialogTitle className={cn('pr-6 leading-snug [overflow-wrap:anywhere]', editing && 'sr-only')}>{values.name}</DialogTitle>
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
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`${id}-notes`} className="mr-auto">
                  Synthèse
                </Label>
                {/* Seulement s'il y a quelque chose à insérer. */}
                {summaries.recent.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    className="insert-done h-7 text-xs text-muted-foreground"
                    title="Insérer les tâches faites depuis la version d’avant, en liens vers leur fiche"
                    onClick={() => insert(taskLines(summaries.recent))}
                  >
                    <ListChecks aria-hidden /> Tâches faites ({summaries.recent.length})
                  </Button>
                )}
                {p1.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    className="insert-p1 h-7 text-xs text-muted-foreground"
                    title="Insérer les tâches à faire de priorité 1, en liens vers leur fiche"
                    onClick={() => insert(taskLines(p1))}
                  >
                    <PriorityIcon priority={null} /> Priorités 1 ({p1.length})
                  </Button>
                )}
              </div>
              <Textarea
                ref={refs.notes}
                id={`${id}-notes`}
                className="min-h-[35vh] font-mono text-sm"
                placeholder={SUMMARY_HINT}
                value={values.notes}
                onChange={set('notes')}
                aria-describedby={`${id}-hint`}
              />
            </div>
          </>
        ) : (
          <div ref={reader} tabIndex={-1} className="reader grid min-h-0 flex-1 gap-4 outline-none" aria-describedby={`${id}-hint`}>
            {/* Comme la fiche d'une tâche : libellés atténués, valeur absente aussi. */}
            <dl className="grid grid-cols-[7rem_1fr] gap-x-4 text-sm leading-7">
              <dt className="text-muted-foreground">Ticket</dt>
              <dd className={cn('ticket-value font-mono', !values.ticket && 'font-sans text-muted-foreground')}>
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
            {/* Versions : seulement s'il y en a une d'avant à consulter. */}
            {summaries.versions.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor={`${id}-version`} className="text-muted-foreground">
                  Synthèse
                </label>
                <select
                  id={`${id}-version`}
                  className="summary-version rounded-md border bg-background px-1.5 py-0.5"
                  value={shownDay}
                  onChange={(e) => setShownDay(e.target.value)}
                >
                  {summaries.versions.map((v, i) => (
                    <option key={v.day} value={i === 0 ? '' : v.day}>
                      {formatDay(v.day)}
                      {i === 0 ? ' (actuelle)' : ''}
                    </option>
                  ))}
                </select>
                {shown && (
                  <Button
                    type="button"
                    size="sm"
                    className="summary-restore h-7 text-xs"
                    title="Faire de cette version la synthèse du jour (annulable : u)"
                    onClick={restore}
                  >
                    Restaurer cette version
                  </Button>
                )}
              </div>
            )}
            <div
              className={cn(
                'notes-preview markdown min-h-[35vh] overflow-y-auto rounded-md border px-3 py-2 text-sm',
                shown && 'border-dashed',
                !shownNotes.trim() && 'flex items-center justify-center text-base text-muted-foreground',
              )}
              onClick={onPreviewClick}
              onDoubleClick={() => !shown && startEditing('notes')}
              {...(shownNotes.trim() ? { dangerouslySetInnerHTML: { __html: shownHtml } } : { children: 'Aucune synthèse' })}
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
